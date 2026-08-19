# Checklist de submissão — Retrofoot 2026

Guia de tudo que falta pra submeter o app na App Store. Itens marcados **[Claude]** já estão prontos no repositório; itens **[Você]** exigem acesso à sua conta Apple Developer / App Store Connect / GitHub e precisam ser feitos manualmente no seu Mac.

> ⚠️ **Antes de testar QUALQUER mudança no Xcode:** a pasta `ios/App/App/public` (onde fica o JS/CSS compilado que o Xcode empacota) está no `.gitignore` — ela nunca é commitada nem enviada pro GitHub. Um `git pull` sozinho **não atualiza o app**, mesmo que o código-fonte já tenha sido corrigido e enviado. Sempre rode, no seu Mac, depois de puxar qualquer mudança:
> ```
> git pull origin claude/tudo-bem-upw55v
> npm install
> npm run build
> npx cap sync ios
> ```
> Só depois disso abra/rode no Xcode. Esse passo é repetido toda vez, não só na submissão final (ver seção 9).

---

## 1. Hospedar as páginas de privacidade e suporte **[Você]**

App Store Connect exige URLs públicas (não pode ser um arquivo local). O jeito mais rápido, sem custo, usando o que já existe no repositório (`docs/loja/privacidade.html` e `docs/loja/suporte.html`):

1. No GitHub, vá em **Settings → Pages** do repositório `diogosanderc/joguinho`.
2. Em **Source**, escolha **Deploy from a branch**.
3. Branch: `master`, pasta: **/docs**. Salve.
4. Em alguns minutos as páginas ficam em:
   - Privacidade: `https://diogosanderc.github.io/joguinho/loja/privacidade.html`
   - Suporte: `https://diogosanderc.github.io/joguinho/loja/suporte.html`
5. Guarde essas duas URLs — vão entrar em **App Store Connect → App Information → Privacy Policy URL** e no campo de **Support URL**.

(Se preferir um domínio próprio, também funciona — só apontar o DNS pro GitHub Pages ou hospedar os dois HTMLs em qualquer lugar público.)

---

## 2. Metadados da ficha na loja **[Você — copiar e colar]**

Tudo dentro dos limites de caracteres da Apple, já conferido.

**Nome do app** (máx. 30):
```
Retrofoot 2026
```

**Subtítulo** (máx. 30):
```
Dirigente de futebol 2026
```

**Texto promocional** (máx. 170 — esse campo dá pra editar depois, sem precisar reenviar o app pra revisão):
```
Novo: Mundial de Clubes! Vença a Libertadores e encare os gigantes da Europa pelo título mundial.
```

**Palavras-chave** (máx. 100, sem espaço depois da vírgula):
```
futebol,manager,tecnico,dirigente,libertadores,brasileirao,elenco,mercado,transferencia,craque
```

**Categoria primária:** Jogos → Esportes
**Categoria secundária (opcional):** Jogos → Simulação

**Descrição** (máx. 4000):
```
Assuma o comando de qualquer clube da Série A, B ou C e construa a carreira de técnico dos seus sonhos no futebol brasileiro.

CAMPEONATOS
- Série A, B e C, com acesso e rebaixamento reais
- Copa do Brasil (mata-mata com todos os 60 clubes do jogo)
- Copa Libertadores, com sorteio realista entre 9 países sul-americanos (Argentina, Bolívia, Chile, Colômbia, Equador, Paraguai, Peru, Uruguai e Venezuela)
- Mundial de Clubes: sendo campeão da Libertadores, encare um clube saudita na semifinal e um gigante europeu (Real Madrid, Manchester City, Bayern de Munique, PSG e outros) na final
- Seleção Brasileira, convocações e amistosos

MERCADO DE TRANSFERÊNCIAS
- Elencos reais dos 60 clubes das três divisões
- Mercado internacional com mais de 20 ligas: Premier League, La Liga, Serie A, Bundesliga, Ligue 1, Liga Saudita, MLS, Primeira Liga, Eredivisie, Super Lig, Liga Russa, Liga Belga e todas as ligas nacionais da América do Sul
- Negocie, empreste e renove contratos

GESTÃO COMPLETA DE CLUBE
- Finanças, empréstimos bancários e patrocinadores
- Estádio, camarotes VIP e preço de ingresso
- Departamento médico e categoria de base
- Personalidade e potencial oculto dos jogadores jovens

NA PARTIDA
- Simulação ao vivo, minuto a minuto
- Escale a formação, faça substituições e mude a tática durante o jogo
- Entrevistas coletivas antes de decisões importantes

CARREIRA E CONQUISTAS
- Estatísticas, histórico de temporadas e prêmios individuais (Craque do Mês, Torcedor do Jogo)
- Conquistas conectadas ao Game Center
- Até 4 campanhas salvas simultâneas com o Retrofoot Premium

O Retrofoot 2026 é gratuito para jogar. O Retrofoot Premium é uma compra única opcional que remove os anúncios e libera o modo carreira completo (Série A/B, negociações com clubes grandes, Copa, Libertadores, Mundial e Seleção Brasileira).
```

**Suporte / Marketing URL:** as duas do passo 1.

---

## 3. Compra dentro do app (IAP) **[Você]**

App Store Connect → seu app → **Recursos → Compras via app** → criar uma nova:

| Campo | Valor |
|---|---|
| Tipo | Não consumível (Non-Consumable) |
| ID do produto (Product ID) | `com.diogosander.retrofoot.premium` — **precisa ser exatamente esse**, já é o que está hardcoded no `NativeServicesPlugin.swift` |
| Nome de referência | Retrofoot Premium |
| Nome exibido pro usuário | Retrofoot Premium |
| Preço | R$ 9,99 (ou o tier equivalente que a Apple mapear — esse valor já está no texto do paywall dentro do app) |
| Descrição | "Remove os anúncios e libera Série A/B, negociações com clubes grandes, Departamento Médico, Categoria de Base, Copa do Brasil, Libertadores, Mundial de Clubes, Seleção Brasileira e 4 slots de save." |
| Screenshot de revisão | print da tela de paywall do app (`PremiumPaywallModal`) |

---

## 4. Game Center **[Você]**

App Store Connect → seu app → **Recursos → Game Center** (ative se ainda não estiver).

### Conquistas (Achievements)
Cadastre essas 13 — os IDs precisam ser **exatamente** esses, é o que o código já reporta (`src/data/achievements.ts` + `App.tsx`):

| ID | Título sugerido | Pontos |
|---|---|---|
| `first_win` | Primeira Vitória | 10 |
| `wins_50` | Veterano | 20 |
| `wins_100` | Centenário | 30 |
| `wins_250` | Lenda dos Gramados | 50 |
| `unbeaten_10` | Invencível | 20 |
| `unbeaten_20` | Muralha | 30 |
| `first_title` | Campeão Nacional | 30 |
| `dynasty` | Dinastia | 50 |
| `cup_king` | Rei do Brasil | 40 |
| `libertadores_king` | Rei da América | 60 |
| `libertadores_dynasty` | Tri-Campeão Continental | 100 |
| `mundial_finalist` | Finalista Mundial | 60 |
| `mundial_champion` | Campeão do Mundo | 100 |

(Pontos são só uma sugestão pra somar 1000 — a Apple limita o total do jogo a 1000 pontos Game Center; ajuste como quiser desde que a soma bata.)

### Placares (Leaderboards) — opcional, ainda não usado no código
O plugin nativo já tem `submitScore`/`showLeaderboard` prontos, mas nenhuma tela do jogo chama isso ainda. Se quiser lançar já com um placar (ex: total de vitórias, ou patrimônio do clube), me avise depois — é rápido de ligar, mas por enquanto não crie um leaderboard vazio no Game Center sem código nenhum enviando pontuação.

---

## 5. Formulário de privacidade (App Privacy) **[Você]**

App Store Connect → seu app → **App Privacy**. Com base em como o app realmente funciona hoje:

- **"Does this app collect data?"** → **Yes** (por causa do AdMob e do IAP/Game Center/iCloud, mesmo sem servidor próprio).
- **Identifiers → Device ID**: coletado (identificador vinculado ao app/dispositivo, não o IDFA — o app não pede ATT e não usa IDFA), usado pra **Analytics** e **App Functionality** (o AdMob usa isso pra limitar frequência de anúncio e prevenir fraude) — **não vinculado à identidade do usuário**, **não usado pra rastreamento (tracking)**.
- **Usage Data → Advertising Data / Product Interaction**: a tabela oficial do Google pro Mobile Ads SDK também lista "anúncios que o usuário viu" e "interações no app" (ex: toques, visualizações) como coletados pelo SDK — declare como **Analytics**, mesma lógica do Device ID (não vinculado à identidade, sem tracking).
- **Purchases → Purchase History**: normalmente **não precisa declarar** — a transação inteira (incluindo dados de pagamento) é processada pela StoreKit/Apple, o app só consulta se o direito de compra existe.
- **Nenhum outro tipo de dado** (nome, e-mail, localização, contatos, saúde, conteúdo do usuário, navegação, etc.) — o app não pede nem acessa nada disso.
- Confirme na pergunta de **tracking (ATT)**: **Não rastreia** — os anúncios são não-personalizados, sem IDFA.

Isso é a leitura mais precisa possível com base no código e na busca mais recente que consegui fazer (a página de suporte do Google ficou bloqueada pro meu acesso direto, então usei busca + a página `developers.google.com/admob/ios/privacy/data-disclosure` indexada). A taxonomia exata da Apple muda de vez em quando — antes de confirmar, abra essa página você mesmo no navegador: [App store data disclosure | iOS | Google for Developers](https://developers.google.com/admob/ios/privacy/data-disclosure). Ela tem a tabela oficial e atualizada com cada tipo de dado que o SDK pode coletar.

---

## 6. Classificação etária (Age Rating) **[Você]**

O questionário novo da Apple (desde 2024) pergunta por categorias de conteúdo. Pra este jogo, a resposta é **"Nenhum"** ou **"Não"** em praticamente tudo: sem violência, sem conteúdo sexual, sem drogas, sem apostas simuladas com dinheiro real, sem conteúdo gerado por usuário, sem chat. Isso deve resultar em classificação **4+**.

---

## 7. Screenshots **[Claude gerou e já curou os 10, você pode usar direto ou polir]**

10 capturas em `docs/loja/screenshots/`, já numeradas na ordem final de upload, resolução 1284×2778 (a categoria "iPhone Tela de 6,5 pol." é a única exigida em App Store Connect pra este app). Apple permite no máximo 10 por tamanho de tela e os 2 primeiros são os que mais pesam na conversão, por isso a ordem começa pelas telas de maior impacto visual (ação ao vivo, pênalti, VAR) antes das telas de configuração:

1. `01-partida-ao-vivo.png` — partida ao vivo, placar e rodada completa do Brasileirão
2. `02-penalti.png` — modal de pênalti, escolha do batedor
3. `03-var.png` — modal de revisão do VAR
4. `04-serie-a-elenco.png` — tática/escalação na Série A
5. `05-mercado-internacional.png` — mercado internacional mostrando jogadores da Premier League, Bundesliga e MLS lado a lado
6. `06-comprar-jogador.png` — confirmação de compra de um jogador no mercado
7. `07-conquistas.png` — tela de conquistas (aparecem todas travadas por ser carreira nova; uma carreira mais avançada mostraria troféus desbloqueados, o que fica mais bonito pra loja)
8. `08-criar-carreira.png` — seleção de clube (mostra a variedade dos 60 clubes)
9. `09-serie-a-escritorio.png` — escritório com um clube da Série A (Fluminense)
10. `10-menu.png` — tela inicial

Duas capturas ficaram de fora por serem redundantes com a 04 e a 09 (mesma tela, só que com um clube da Série C recém-criado, visualmente mais fraco) — continuam guardadas em `docs/loja/screenshots/descartados/` caso você prefira usar alguma delas no lugar de outra.

---

## 8. Já verificado/corrigido no código **[Claude]**

- ✅ `PrivacyInfo.xcprivacy` criado e registrado no projeto Xcode (obrigatório desde maio/2024). Auditei o `NativeServicesPlugin.swift` e não há uso direto de API que exija categoria declarada; o SDK do Google Mobile Ads (v13.7.0 via SPM) já embute o manifesto dele próprio.
- ✅ Política de privacidade corrigida (a menção a conquistas dizia "no futuro" — já está em produção).
- ✅ Ícone do app: 1024×1024, sem transparência, formato correto.
- ✅ Bundle ID (`com.diogosander.retrofoot`), Team ID e capability de Game Center já configurados no `.entitlements`.
- ✅ `GADApplicationIdentifier` e `SKAdNetworkItems` já no `Info.plist`.

## 9. O que só dá pra fazer no seu Mac **[Você]**

1. `git pull` a branch mais recente, `npm install`, `npm run build`, `npx cap sync ios` (ver aviso no topo do documento — isso vale pra toda mudança de código, não só pra este passo final).
2. Abrir no Xcode, conferir que o `PrivacyInfo.xcprivacy` aparece no navegador de arquivos do projeto (deve aparecer automaticamente, já registrado no `.pbxproj`).
3. **Product → Archive**. Se o Xcode acusar alguma "Required Reason API" faltando (raro, mas pode acontecer por causa de alguma dependência que eu não consigo auditar sem compilar), me avise qual categoria ele aponta que eu ajusto o manifesto.
4. Enviar pro App Store Connect via Xcode Organizer (ou Transporter).
5. Testar pelo **TestFlight** antes de submeter pra revisão — principalmente o fluxo de compra do Premium e a autenticação do Game Center, que só funcionam de verdade num build assinado, não no `npm run dev`.
6. Preencher os itens **[Você]** acima em App Store Connect.
7. Enviar pra revisão.
