# Libertadores — Fase 1: clubes reais + mercado internacional

## Contexto

O jogo hoje simula Série A/B/C do Brasileirão (60 clubes) + Copa do Brasil (mata-mata
nacional, `src/utils/cupEngine.ts`). O usuário quer, além disso, a Copa Libertadores:
32 times, fase de grupos + mata-mata, 4 vagas automáticas (top 4 do Brasileirão da
temporada anterior) + 28 sorteadas de uma base de clubes sul-americanos.

Dado o tamanho do recurso completo, o trabalho foi dividido em 3 fases:

1. **Fase 1 (este documento)** — importar os clubes sul-americanos reais como clubes de
   verdade no jogo e integrá-los no Mercado (compra de jogadores + ofertas recebidas).
2. **Fase 2** — motor da fase de grupos da Libertadores.
3. **Fase 3** — mata-mata (oitavas em diante) + integração completa no calendário da
   temporada.

Este documento cobre **só a Fase 1**.

## Fonte de dados

CSV fornecido pelo usuário (`jogadores_internacionais.csv`, ~26 mil jogadores, 657
clubes). Filtrando por clubes argentinos e colombianos com elenco substancial (≥25
jogadores, todas as posições cobertas), chegamos a **49 clubes**:

- **Argentina (30):** River Plate, Boca Juniors, Racing, Independiente, San Lorenzo,
  Vélez Sarsfield, Talleres, Newell's Old Boys, Rosario Central, Estudiantes de La
  Plata, Gimnasia La Plata, Huracán, Banfield, Lanús, Tigre, Platense, Argentinos
  Juniors, Godoy Cruz, Belgrano, Instituto, Central Córdoba (Sgo. del Estero e
  Rosario), Unión, Sarmiento, Aldosivi, Barracas Central, Independiente Rivadavia,
  Gimnasia y Esgrima de Mendoza, San Martín (San Juan), Tucumán.
- **Colômbia (19):** Millonarios, Junior FC, Atlético Nacional, América de Cali,
  Deportivo Cali, Independiente Santa Fe, Independiente Medellín, Once Caldas,
  Deportes Tolima, Atlético Bucaramanga, Deportivo Pereira, Envigado, Boyacá Chicó,
  Alianza FC, Deportivo Pasto, Llaneros, Rionegro Águilas, Unión Magdalena,
  Internacional de Bogotá.

Nenhum time de Uruguai, Chile, Equador, Peru, Paraguai, Venezuela ou Bolívia existe
no CSV com dados suficientes — de fora do escopo desta fase (o "sorteio" de 28 vagas
na Fase 2/3 vai escolher só entre esses 49, mais qualquer expansão futura).

## Modelo de dados

Novo estado persistido no `GameContext`, paralelo a `clubs`:

```ts
libertadoresClubs: Club[] // mesmo tipo Club já usado por Série A/B/C
```

Cada clube reaproveita a interface `Club`/`ClubDefinition` já existente (id, nome,
cores, estádio, reputação, `squad: Player[]`, finances=0 — não relevante nesta fase).
Ficam **fora** do array `clubs` principal por enquanto (não entram em standings,
schedule ou Copa do Brasil — isso é Fase 2/3), mas usam a mesma estrutura de dados
para zero retrabalho depois.

**Conversão de posição:** direto pras 8 posições do jogo, exceto `ATA` (o CSV não
separa ponta de centroavante) — dividido via a coluna real `SubPosicaoOriginal`:
`Left Winger`/`Right Winger` → `PON`, `Centre-Forward`/`Second Striker` → `CA`.

**Elenco:** até 25 jogadores por clube, priorizando maior rating (clubes têm de 25 a
64 no CSV bruto).

**Rating/valor:** reaproveita a curva já usada pros ~3.450 jogadores europeus
existentes (`public/data/foreign_players.json`) — valor de mercado em euros mapeado
pra rating 0-99 numa escala calibrada, preço final em R$ pela mesma fórmula
rating→valor dos jogadores nacionais. Mantém a economia do jogo consistente sem
inventar uma segunda fórmula.

**Reputação do clube:** derivada do rating médio do elenco.

**Estádio:** nomes reais curados pros clubes mais conhecidos (La Bombonera, Monumental
de Núñez, Cilindro, Atanasio Girardot, El Campín, José Amalfitani, etc.); nome/
capacidade genéricos calculados pros demais.

## Mercado → Outras Ligas → Libertadores

Hoje existe uma aba "Outras Ligas" que já deixa comprar jogadores de Premier League,
Serie A, Bundesliga, La Liga e Ligue 1 via um pool estático (`foreign_players.json`,
carregado 1x, nunca mutado — comprar só marca o id em `boughtForeignIds` pra nunca
mais reaparecer). A entrada "Libertadores" hoje é rala (20 clubes, 5-11 jogadores
cada) e vai ser **substituída** — mas ao contrário das ligas europeias, ela vai ler
diretamente do estado real `libertadoresClubs` (não de um JSON estático), porque:

> Comprar um jogador de um clube da Libertadores REMOVE ele do elenco de verdade
> desse clube (estado mutável), e ADICIONA no elenco do usuário — exatamente como
> qualquer contratação hoje. Diferente das ligas europeias (pool descartável), aqui
> o "vendedor" é um clube de verdade que vai jogar a competição na Fase 2/3, então a
> venda precisa refletir nele.

Efeito colateral esperado e desejado: um clube "saqueado" ao longo de várias
temporadas vai ficando mais fraco de verdade — coerente com a Libertadores futura.

## Ofertas recebidas (clubes fazem propostas por jogadores brasileiros)

A lista `FOREIGN_CLUBS` (hoje 8 nomes genéricos de "Libertadores" + clubes europeus,
usada só como texto do comprador nas propostas recebidas) passa a usar os 49 nomes
reais no lugar dos 8 genéricos. Nenhuma outra mudança de mecânica (valor da oferta já
é calculado independente de quem é o comprador).

## Envelhecimento, aposentadoria e reposição de elenco (universal, desde a Fase 1)

Gap identificado: a aposentadoria automática (já em produção) remove jogadores mas
**nunca gera reposição** — isso já afeta Série A/B/C hoje, e afetaria os 49 clubes da
Libertadores também (esvaziando com vendas + aposentadoria).

O usuário confirmou que quer isso corrigido de forma **universal e já nesta fase**:
os 49 clubes da Libertadores passam pelo mesmo ciclo anual de fim de temporada que
Série A/B/C, mesmo sem calendário/partidas próprias ainda. Concretamente, o
`endSeason` passa a rodar, para `clubs` **e** para `libertadoresClubs` igualmente:

1. **Envelhecimento:** idade + 1 pra cada jogador, todo fim de temporada.
2. **Aposentadoria:** mesmas curvas por idade/posição já em produção (39+, goleiro e
   zagueiro aguentam mais).
3. **Reposição:** todo clube que perdeu jogador(es) na temporada (aposentadoria OU
   venda, incluindo vendas pro exterior) recebe jogador(es) jovem(ns) novo(s) (17-20
   anos, rating inicial modesto escalado pela reputação do clube), preenchendo a
   posição mais rala do elenco.

Garante que nenhum elenco, em nenhuma divisão ou país, fique abaixo do mínimo jogável
ao longo de uma carreira longa — e que os 49 clubes cheguem "vivos" (elenco atualizado,
não congelado) no dia em que a Fase 2/3 realmente colocar a Libertadores em campo.

Fica de fora nesta fase apenas o que depende de calendário/partida em si: standings,
confiança, finanças, patrocínio, moral — nada disso se aplica a um clube que não joga
nenhuma partida ainda.

## Fora de escopo nesta fase (fica pra Fase 2/3)

- Os 49 clubes não entram em `clubs`, não têm calendário, não jogam partida nenhuma.
- Nenhuma UI de "ver todos os 49 clubes" fora do fluxo de compra já existente (browse
  por liga → clube → jogador).

## Testes planejados

- `npx tsc --noEmit -p tsconfig.app.json` + `npm run build`.
- Script standalone validando a conversão do CSV (contagem de jogadores por clube,
  distribuição de posições incluindo o split PON/CA, nenhum clube com posição zerada).
- Playwright: abrir Mercado → Outras Ligas → Libertadores, escolher um clube,
  comprar um jogador, confirmar que (a) ele aparece no elenco do usuário, (b) some do
  elenco do clube de origem em `libertadoresClubs`, (c) uma oferta recebida com
  comprador de um dos 49 nomes aparece corretamente.
- Simular fim de temporada com um clube tendo perdido jogadores (venda + aposentadoria
  injetada) e confirmar que ele recebeu reposição jovem na posição certa — testado
  tanto num clube de `clubs` quanto num de `libertadoresClubs`, confirmando que os 49
  novos clubes envelhecem/aposentam/repõem exatamente como os brasileiros.
