# Premium (compra única via StoreKit)

## Contexto

O usuário pretende publicar o Retrofoot 2026 na App Store e monetizar com uma compra
única "Premium" (R$ 9,90, via `StoreKit`) que libera de uma vez um conjunto de recursos
hoje disponíveis livremente. Não há anúncios implementados ainda (fora de escopo aqui);
não há compras separadas por item — é uma única trava, um único produto.

O app já é empacotado como projeto iOS via Capacitor (`ios/App/App.xcodeproj`), com um
plugin nativo próprio em `ios/App/App/NativeServicesPlugin.swift` (Swift, GameKit +
`NSUbiquitousKeyValueStore`) espelhado em `src/utils/nativeServices.ts`. Este documento
estende esse mesmo padrão para StoreKit, em vez de introduzir uma biblioteca terceirizada
(RevenueCat) ou um backend de validação de recibo — o jogo é 100% client-side
(`localStorage`) e não há infraestrutura de servidor a reaproveitar.

Confirmado via pesquisa: IAP com StoreKit **exige** Apple Developer Program pago
(a mesma exigência que já se aplica pra publicar na App Store e, separadamente, pro
Game Center funcionar) — não é um requisito novo, só reforça que tudo depende da mesma
assinatura paga.

## O que fica travado sem Premium

1. **Divisão inicial (novo jogo)**: só Série C disponível. Série A e B aparecem com
   cadeado no seletor de divisão (`selectedStartDivision`, `src/App.tsx` ~linha 137/1363/1447).
2. **Mercado de transferências**: só é possível negociar jogadores de clubes da Série B
   e C. Série A trancada no seletor "Série" da tela de mercado (`selectedSearchDiv`,
   ~linha 3164-3173). *(Série B e C continuam livres — só Série A é premium.)*
3. **Departamento Médico e Categoria de Base**: os cards continuam visíveis com a
   descrição do que fazem (~linha 3819-3900), mas o botão de avançar nível vira um botão
   travado.
4. **Slots de save extras**: Slot 01 livre; Slots 02, 03 e 04 travados (modal de slots,
   ~linha 1130-1250 e 5072-5217).
5. **Competições extras (Copa, Libertadores, Seleção Brasileira)**: continuam
   acontecendo normalmente nos bastidores (classificação, convocação, outros clubes
   jogando) para todo mundo, premium ou não — isso não muda. O que trava é a tela de
   "Iniciar Partida" do usuário nessas competições: sem Premium, no lugar do botão normal
   aparece o paywall.

**Nunca existiu / fora de escopo**: Investidor/SAF foi implementado e depois removido
num commit anterior (`9f11c80`) — não existe mais no jogo, não faz parte desta trava.

**Progresso já existente nunca é tomado**: a trava só se aplica a ações NOVAS a partir de
quando este sistema entrar. A campanha de teste atual do usuário (Fluminense, Série A,
Rodada 12, Slot 01) continua jogável normalmente, sem nenhuma restrição retroativa.

## Arquitetura

### Plugin nativo (`NativeServicesPlugin.swift`)

Três métodos novos, usando StoreKit 2 (`Transaction`, `Product`), no mesmo arquivo do
plugin existente:

```swift
@objc func purchasePremium(_ call: CAPPluginCall) {
    // Product.products(for: ["com.diogosander.retrofoot.premium"]) -> product.purchase()
    // resolve({ purchased: Bool }) ou reject(erro/cancelamento)
}

@objc func restorePurchases(_ call: CAPPluginCall) {
    // AppStore.sync() + rechecagem de currentEntitlements
    // resolve({ restored: Bool })
}

@objc func isPremiumUnlocked(_ call: CAPPluginCall) {
    // itera Transaction.currentEntitlements procurando o productId do Premium
    // resolve({ unlocked: Bool })
}
```

A verificação usa só `Transaction.currentEntitlements` (já assinado/verificado
criptograficamente pelo StoreKit) — sem backend de validação de recibo, adequado ao porte
do projeto.

### Espelho JS (`src/utils/nativeServices.ts`)

Mesmo padrão `isNative()`-guarded já usado por `authenticateGameCenter` etc:

```ts
export async function purchasePremium(): Promise<boolean> { /* false fora do nativo */ }
export async function restorePurchases(): Promise<boolean> { /* false fora do nativo */ }
export async function isPremiumUnlocked(): Promise<boolean> {
  if (!isNative()) return false; // sem StoreKit no preview de navegador
  try { return (await NativeServices.isPremiumUnlocked()).unlocked; }
  catch { return false; } // erro nunca libera Premium por acidente
}
```

### Estado global (`src/context/PremiumContext.tsx`, novo)

Contexto separado do `GameContext` (que já é grande e cuida só de jogo/save). Expõe
`usePremium()`:

```ts
interface PremiumContextValue {
  isPremium: boolean;
  loading: boolean;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
}
```

Ao montar, chama `isPremiumUnlocked()` uma vez e guarda o resultado em memória + um cache
rápido em `localStorage` (`retrofoot_2026_premium_cache`) só pra evitar tela piscando
"travado" por uma fração de segundo antes da checagem nativa responder — o valor
autoritativo em qualquer momento crítico (compra, restauração) é sempre o retorno direto
do plugin, nunca só o cache.

## Componentes de UI

- **Ícone de cadeado**: `Lock` do `lucide-react` (já é dependência), ao lado de qualquer
  opção travada.
- **`PremiumPaywallModal`** (novo componente, reaproveitado em todos os pontos de
  bloqueio): recebe uma prop `reason: string` (ex: `"Série A"`, `"Departamento Médico"`,
  `"Libertadores"`) pra customizar o título/descrição. Conteúdo fixo: lista do que o
  Premium libera, preço (R$ 9,90), botão "Desbloquear Premium" (chama `purchase()`), link
  "Restaurar compra" (chama `restore()` — exigido pela Apple pra IAP não-consumível).
  Usa as classes `modal-overlay`/`modal-content` já existentes no app.

Padrão em cada um dos 5 pontos de bloqueio: a opção continua **visível com cadeado**
(não desaparece, não fica cinza sem explicação) — ao tocar, abre o `PremiumPaywallModal`
em vez de executar a ação.

## Tratamento de erros

- Compra cancelada pelo usuário (fecha a folha de pagamento da Apple): fecha o modal
  silenciosamente, sem mensagem de erro.
- Falha de rede/pagamento: `"Não foi possível completar a compra agora. Tente
  novamente."`
- Restaurar sem achar nada: `"Nenhuma compra encontrada pra restaurar."`
- Qualquer erro ao checar `isPremiumUnlocked()`: assume `false` (travado) — nunca libera
  por erro.
- Após compra ou restauração bem-sucedida, `PremiumContext` atualiza o estado na hora,
  sem precisar reabrir o app.

## Testes

- **StoreKit Configuration File** (arquivo `.storekit` local no Xcode, anexado ao esquema
  de build): simula o produto `com.diogosander.retrofoot.premium` e o fluxo de compra sem
  precisar de App Store Connect nem de conta paga configurada ainda, e sem gastar
  dinheiro real.
  - Testar "não pago": estado padrão de uma instalação nova.
  - Testar "pago": tocar em "Desbloquear Premium" no paywall → tela de compra simulada da
    Apple → confirmar → app libera tudo na hora.
  - Voltar pra "não pago": **Debug > StoreKit > Manage Transactions** no Xcode (com o app
    rodando) → selecionar a transação simulada → excluir/reembolsar → app volta a mostrar
    tudo travado.
  - Testar "Restaurar Compra": comprar (teste), desinstalar/reinstalar o app (limpa o
    cache local), tocar em "Restaurar Compra" no paywall → deve reconhecer a transação de
    teste ainda existente e liberar tudo de novo.
- **Playwright** (já usado no projeto): cobre só a parte visual no preview de navegador —
  cadeados aparecendo nos lugares certos, modal abrindo com o texto certo — já que a
  compra em si só existe no app nativo (`isNative()` é sempre `false` no navegador).
- **Regressão**: confirmar que a campanha de teste atual (Fluminense, Série A, Rodada 12,
  Slot 01) continua carregando e jogando normalmente, sem nenhuma trava aparecendo nela.

## Fora de escopo

- Compras separadas por item (é uma única compra "Premium" que libera tudo).
- Anúncios / remoção de anúncios (não há anúncios implementados no jogo ainda).
- Backend de validação de recibo (verificação fica só local, via StoreKit 2).
- RevenueCat ou qualquer biblioteca terceirizada de IAP.
- Suporte a Android (o app hoje só empacota iOS via Capacitor).
- Investidor/SAF (recurso removido do jogo antes deste documento existir).
