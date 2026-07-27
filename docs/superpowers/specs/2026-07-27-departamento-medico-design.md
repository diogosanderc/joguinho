# Departamento Médico

## Contexto

O usuário pediu uma lista de novas mecânicas para o jogo. Das 10 aprovadas, esta é a
primeira (Fase 1 da decomposição, mecânica "rápida" que reaproveita um padrão já
existente no código — o mesmo fluxo de construção/ampliação usado pelo Estádio e pelos
Camarotes VIP: `upgradeStadium`/`StadiumUpgrade` e `buildVipBoxes`+`upgradeVipBoxes`/
`VipBoxUpgrade` em `src/context/GameContext.tsx`).

O Departamento Médico é uma estrutura que o usuário constrói e evolui em até 3 níveis,
reduzindo a duração das lesões dos jogadores do seu clube. Não afeta a chance de
lesionar, só quanto tempo o jogador fica fora depois de se machucar — mantendo o
escopo enxuto e evitando reblanceamento de outra mecânica (a chance de lesão já
depende de idade/fadiga, ver `nextRoundImpl`).

## Lesões hoje (onde o efeito entra)

Duas rolagens idênticas de duração de lesão existem em `GameContext.tsx`, dentro do
map por jogador em `nextRoundImpl`:

1. Lesão por evento de partida (`ev.type === 'INJURY'`, ~linha 1110).
2. Lesão aleatória por rodada, sem evento de partida, calculada por idade/fadiga
   (~linha 1135) — só se aplica ao clube do usuário.

Ambas fazem exatamente `Math.random() < 0.70 ? 1 : Math.floor(Math.random() * 3) + 2`
(70% chance de 1 semana, senão 2-4 semanas). Isso vira uma função auxiliar única:

```ts
const rollInjuryWeeks = (medicalDeptLevel: number): number => {
  const base = Math.random() < 0.70 ? 1 : Math.floor(Math.random() * 3) + 2;
  const reduction = MEDICAL_DEPT_REDUCTION_BY_LEVEL[medicalDeptLevel] ?? 0;
  return Math.max(1, Math.round(base * (1 - reduction)));
};
```

Chamada nos dois pontos com `medicalDeptLevel = club.id === userClubId ? (club.medicalDeptLevel ?? 0) : 0`
(só o clube do usuário tem departamento médico, times bot nunca constroem isso — mesmo
critério já usado pra `hasVipBoxes`/`stadiumCapacity`).

## Modelo de dados

`src/data/database.ts`:

```ts
export const MEDICAL_DEPT_LEVEL_NAMES: Record<number, string> = {
  0: 'Nenhum', 1: 'Básico', 2: 'Intermediário', 3: 'Avançado'
};
export const MEDICAL_DEPT_REDUCTION_BY_LEVEL: Record<number, number> = {
  0: 0, 1: 0.20, 2: 0.40, 3: 0.60
};
export const MEDICAL_DEPT_COST_BY_LEVEL_DIV: Record<number, Record<string, number>> = {
  1: { A: 2000000, B: 1000000, C: 500000 },
  2: { A: 6000000, B: 3000000, C: 1500000 },
  3: { A: 12000000, B: 6000000, C: 3000000 }
};
```

`Club` interface ganha `medicalDeptLevel?: number;` (0/undefined = nenhum, até 3).

`GameContext.tsx` ganha a interface `MedicalDeptUpgrade { level: number; cost: number;
weeksLeft: number }` (nível **alvo** da obra em andamento) e o estado ref-backed
`medicalDeptUpgrade`/`medicalDeptUpgradeRef` (mesmíssimo padrão do `vipBoxUpgrade`
recém-implementado): persistido em `saveGame` via `medicalDeptUpgradeRef.current`
dentro de `buildData`, sem precisar tocar nos ~32 call-sites existentes de
`saveGame(...)`. Restaurado em `loadGame` com `setMedicalDeptUpgrade(data.medicalDeptUpgrade ?? null)`.

Reset para `null` nos mesmos 3 pontos onde `vipBoxUpgrade`/`stadiumUpgrade` já são
zerados (`startGame`, troca de clube em `stayAtClub`, `resetGame`).

## Construção

- Avança **um nível por vez** (não dá pra pular de 0 pro 2 direto) — botão único
  "Avançar para Nível X" mostra sempre o próximo nível disponível.
- **5 rodadas de obra** por nível, fixo pros 3 níveis (mesmo padrão do camarote: uma
  duração simples, sem depender de quantidade).
- Custo por nível/divisão conforme tabela acima — sempre crescente entre níveis e
  entre divisões, seguindo o mesmo espírito de "estrutura mais cara que apenas
  bancada" já estabelecido pelo Camarote VIP.
- Função `upgradeMedicalDept()` em `GameContext.tsx`, espelhando `upgradeVipBoxes`:
  valida clube do usuário existe, nenhuma obra já em andamento, nível atual < 3,
  finanças suficientes; debita custo, seta `medicalDeptUpgrade`, publica notícia
  "Obras iniciadas! Departamento médico avançando para o nível X (Y rodadas)." e
  salva o jogo.
- Bloco de processamento semanal em `nextRoundImpl` (mirror do bloco do
  `vipBoxUpgrade`, logo depois dele): decrementa `weeksLeft`; ao completar, seta
  `medicalDeptLevel` no clube do usuário pro nível alvo, zera `medicalDeptUpgrade`,
  publica notícia "Obras concluídas! Departamento médico agora está no nível X (Y).
  As lesões dos seus jogadores serão mais curtas."

## UI (aba Finanças, novo card "Departamento Médico")

- Nome do nível atual (`MEDICAL_DEPT_LEVEL_NAMES[level]`) e redução ativa em %
  (`MEDICAL_DEPT_REDUCTION_BY_LEVEL[level] * 100`).
- Se `medicalDeptUpgrade` ativo: banner "🚧 Obras em andamento: Nível X (Y rodadas
  restantes)." (mesmo estilo visual dos outros dois cards).
- Senão, se `level < 3`: botão "Avançar para Nível {level+1} (Custo: R$...)".
- Senão (`level === 3`): mensagem "🏆 Departamento médico no nível máximo."

## Fora de escopo

- Não reduz a chance de lesão, só a duração (decisão explícita do usuário).
- Não afeta clubes bot.
- Sem efeito em suspensão por cartão (`suspendedMatches`) — só lesões.

## Testes planejados

- `npx tsc --noEmit -p tsconfig.app.json` + `npm run build`.
- Playwright: usar o cheat code (`querosermilionario`) pra ter caixa, construir nível
  1, injetar `weeksLeft: 1` via localStorage pra completar rápido, jogar uma rodada,
  confirmar `medicalDeptLevel === 1` e o texto do card. Repetir pro nível 3 e
  confirmar que o botão de avançar desaparece (mensagem de nível máximo).
- Verificar via leitura de código (não precisa de RNG controlado) que
  `rollInjuryWeeks` aplica a redução corretamente em ambos os pontos de chamada
  (evento de partida e lesão aleatória por rodada).
