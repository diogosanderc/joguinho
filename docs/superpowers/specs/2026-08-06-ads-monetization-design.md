# Anúncios (AdMob) com Premium removendo anúncios

## Contexto

Modelo de monetização já decidido em conversa: jogo gratuito com anúncios; a compra
"Retrofoot Premium" (já implementada — ver
`docs/superpowers/specs/2026-08-05-premium-iap-design.md` e `src/context/PremiumContext.tsx`)
passa a também remover os anúncios, além das outras travas que já libera (Série A, slots
extras, Departamento Médico, Categoria de Base, Copa/Libertadores/Seleção).

Nenhum SDK de anúncios existe no projeto ainda. Decisões já tomadas com o usuário:

- **Rede**: Google AdMob.
- **Formato**: só **intersticial** (tela cheia) — sem banner, sem recompensado.
- **Onde aparece**: depois que uma partida termina (tela de resultado fechada), não ao abrir
  o app.
- **Frequência**: no máximo 1 anúncio a cada **4 minutos**, mesmo que várias partidas
  (Liga + Copa + Libertadores) terminem em sequência numa mesma semana.
- **Rastreamento**: anúncios **não-personalizados**. Não precisa do prompt de App Tracking
  Transparency (ATT) da Apple.

## Decisão de arquitetura: biblioteca pronta, não plugin nativo do zero

Ao implementar o Premium (StoreKit), levamos várias rodadas pra descobrir o registro correto
de plugin nativo customizado neste projeto (Capacitor 6 + SPM): a classe precisa conformar a
`CAPBridgedPlugin` **e** ser registrada explicitamente via `bridge?.registerPluginInstance(...)`
num `CAPBridgeViewController` customizado (`ios/App/App/BridgeViewController.swift`) — a
detecção automática via `CAP_PLUGIN`/Objective-C não funciona de forma confiável nesse setup.
Isso foi só pra chamar APIs relativamente simples do StoreKit/GameKit.

O SDK do AdMob é bem mais complexo (estado assíncrono de carregamento, callbacks de ciclo de
vida do anúncio, configuração obrigatória no `Info.plist`). Em vez de reescrever essa
integração do zero em Swift, usamos **`@capacitor-community/admob`**, uma biblioteca mantida
ativamente que já resolve tudo isso e expõe uma API JS simples (`AdMob.initialize()`,
`AdMob.prepareInterstitial()`, `AdMob.showInterstitial()`). Reduz drasticamente o risco de
repetir a mesma dor de cabeça de registro de plugin nativo.

## Instalação e configuração nativa

- `npm install @capacitor-community/admob` + `npx cap sync ios`.
- `Info.plist` precisa de:
  - `GADApplicationIdentifier` — o "App ID" gerado ao cadastrar o app no console do AdMob
    (passo manual do usuário, fora do escopo deste código).
  - `SKAdNetworkItems` — lista de identificadores fornecida pela própria Google, colada como
    está na documentação do AdMob.
- Enquanto não há conta AdMob aprovada, usamos os **IDs de teste oficiais do Google**
  (ex: `ca-app-pub-3940256099942544/4411468910` para intersticial em iOS) — funcionam sempre,
  sem risco de violar política de cliques acidentais em anúncio próprio durante testes.

## Módulo `src/utils/ads.ts` (novo)

```ts
const AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910'; // ID de teste do Google -- trocar pelo real depois de criar a conta AdMob
const MIN_INTERVAL_MS = 4 * 60 * 1000; // 4 minutos

let lastAdShownAt = 0;
let initialized = false;

export async function initAds(): Promise<void> {
  // isNative()-guarded, mesmo padrão de nativeServices.ts -- inicializa o SDK uma vez
}

export async function maybeShowInterstitialAfterMatch(isPremium: boolean): Promise<void> {
  if (isPremium) return;
  if (Date.now() - lastAdShownAt < MIN_INTERVAL_MS) return;
  // prepara e mostra o intersticial; em caso de falha (sem preenchimento, sem rede),
  // apenas loga um aviso e segue -- nunca bloqueia o fluxo do jogo
  lastAdShownAt = Date.now();
}
```

`initAds()` é chamada uma vez no mount do `App.tsx`, junto com `authenticateGameCenter()`.
`maybeShowInterstitialAfterMatch(isPremium)` é chamada no(s) botão(ões) que fecham a tela de
resultado de partida (o mesmo "Fim de Rodada (Ver Classificação)" / "Fim de Jogo (Continuar)"
que já existe em `App.tsx`), passando o `isPremium` que já vem de `usePremium()`.

## Tratamento de erros

Qualquer falha (SDK não inicializado, sem preenchimento de anúncio, sem internet) é
capturada e apenas registrada via `console.warn` — o jogo sempre segue pro próximo estado
normalmente, sem travar nem atrasar nada, exatamente como o restante das integrações nativas
já implementadas (Game Center, iCloud, StoreKit).

## Testes

- Rodar com os IDs de teste do Google no Simulador/dispositivo: confirmar que o anúncio
  aparece só após o fim de uma partida (nunca ao abrir o app), respeita os 4 minutos de
  intervalo entre exibições, e **nunca aparece com Premium ativo** — testável junto com o
  fluxo de compra de teste já validado no StoreKit Configuration File.
- Regressão: confirmar que o fluxo de fim de partida continua funcionando normalmente mesmo
  quando o anúncio falha ao carregar (simular offline).

## Impacto na política de privacidade já publicada

A página `docs/loja/privacidade.html` (já publicada) afirma que o jogo *"não usa ferramentas
de rastreamento ou analytics de terceiros"* — isso deixa de ser verdade com o AdMob, mesmo em
modo não-personalizado (a Google ainda processa dados básicos de dispositivo pra entregar
anúncios). A página será atualizada como parte desta implementação, com uma seção nova
explicando o uso do AdMob. O usuário também precisará atualizar a seção "App Privacy" do App
Store Connect na hora de submeter, mencionando o AdMob.

## Fora de escopo

- Anúncios em banner ou recompensados (só intersticial, por decisão do usuário).
- Anúncios personalizados / App Tracking Transparency (decisão do usuário: não-personalizado).
- Anúncio ao abrir o app (só após partida).
- Mediação entre múltiplas redes de anúncio (só AdMob por enquanto).
- Cadastro da conta AdMob em si e obtenção do App ID/Ad Unit ID reais (passo manual do
  usuário, fora do que o código pode fazer).
