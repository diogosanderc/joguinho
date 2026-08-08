# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

**Retrofoot 26** (`com.diogosander.retrofoot`) is a Brazilian football (soccer) manager game — a
browser-based Elifoot/Championship Manager-style single-player game, shipped both as a web app and
as a native iOS app via Capacitor. The entire UI and most in-game text is Portuguese (pt-BR); code
identifiers, types, and comments are English.

The player manages a club through Série A/B/C, the Copa do Brasil, and the Copa Libertadores —
picking lineups/tactics, running the transfer market, managing finances (loans, sponsors, stadium/
VIP box/medical dept/youth academy upgrades), and simming week-by-week rounds across a multi-year
career.

## Commands

```bash
npm run dev       # Vite dev server
npm run build      # tsc -b (type-check, project references) && vite build
npm run lint        # oxlint (see .oxlintrc.json)
npm run preview     # serve the production build locally
```

There is no test suite (no Jest/Vitest configured) — `tsc -b` and `oxlint` are the only automated
checks. Run both before considering a change done.

### iOS (Capacitor)

The `ios/` directory is a checked-in native Xcode project, not generated on demand.

```bash
npx cap sync ios     # after installing/updating a Capacitor plugin, or after `vite build`
npx cap open ios     # open the Xcode project (build/run/App Store archive happen in Xcode)
```

Native iOS integrations (Game Center, iCloud KV save mirroring, StoreKit IAP, AdMob) live in
`ios/App/App/NativeServicesPlugin.swift`, exposed to the web layer as a single custom Capacitor
plugin (`src/utils/nativeServices.ts`). This project's plugin registration does **not** work with
Capacitor's usual `CAP_PLUGIN`/auto-discovery macro — the plugin class must both conform to
`CAPBridgedPlugin` *and* be registered explicitly via `bridge?.registerPluginInstance(...)` in the
custom `ios/App/App/BridgeViewController.swift`. This was hard-won (see the design docs below); keep
following that pattern for any new native call rather than re-deriving plugin registration from
Capacitor's docs.

## Architecture

### State: one context owns the whole game

`src/context/GameContext.tsx` (~5000 lines) is the single source of truth for all game state and
mutation logic — schedule generation, round simulation, transfers, finances, save/load, the Copa do
Brasil and Libertadores brackets, everything. There's no reducer/store library; it's one big
`useState`-per-field `GameProvider` exposing a large context value. `src/context/PremiumContext.tsx`
is a small, separate context that just tracks the Premium (StoreKit) entitlement.

Two things worth knowing before editing `GameContext.tsx`:

- **Ref-mirrored state.** Several pieces of state (`cupState`, `libertadoresState`, `vipBoxUpgrade`,
  `medicalDeptUpgrade`, `youthAcademyUpgrade`, `careerStats`, `foreignMarketPlayers`,
  `boughtForeignIds`, `libertadoresClubs`, `currentSlot`, `penaltyShootout`) are stored in both a
  `useState` and a parallel `useRef`, updated together through a small setter wrapper. This exists
  because `saveGame()` runs synchronously (inside the same call that just updated this state) and
  needs the just-written value immediately — a plain `useState` value would still be stale until the
  next render. When adding new persisted state that `saveGame` (or any other synchronous reader)
  needs right after setting it, follow this same ref-mirroring pattern rather than reading the state
  variable directly.
- **`nextRoundImpl` is the weekly tick.** `nextRound()` (guarded by `isProcessingRoundRef` against
  double-fires from fast double-taps) simulates the user's match, simulates every other match in the
  round across all divisions, rolls flavor news, updates finances/confidence/injuries/suspensions for
  every club, and progresses any in-flight stadium/VIP/medical/youth-academy construction — all in one
  pass. Season rollover (`endSeason`, promotion/relegation, Cup/Libertadores draws for the next season,
  squad replenishment) is a related but separate large function reached once round 38 finishes.

### UI: one large component, gated by `gameState`

`src/App.tsx` (~5500 lines) is almost entirely a single component, `AppContent`, holding dozens of
`useState` hooks for every modal/form/filter in the game. It renders very differently depending on
`GameState` (`'MENU' | 'START' | 'PLAYING' | 'MATCH_DAY' | 'SEASON_END' | 'GAME_OVER' | 'UNEMPLOYED'`,
defined in `GameContext.tsx`): each non-`'PLAYING'` state is an early-return full-screen view (menu,
new-career setup, live match overlay, season-end summary, unemployed/job-offer screen). The normal
`'PLAYING'` state renders the main tabbed screen, switched by `activeTab` (0=Escritório, 1=Elenco,
2=Mercado, 3=Finanças, 4=Classificação). There is no router and no code-splitting by screen — when
adding a new screen or modal, follow the existing pattern of a boolean/enum `useState` flag gating an
inline block rather than introducing new component files, unless the addition is large enough to
justify extracting a component (as `PremiumPaywallModal.tsx` was).

### Domain data and simulation engines (`src/data/`, `src/utils/`)

- `data/database.ts` — the `Player`/`Club` types, the rating→value/salary economy curve, squad/youth
  generation, and `initializeClubs()` which seeds all Série A/B/C clubs from a baked-in
  `CLUB_DEFINITIONS` roster list.
- `data/achievements.ts` — `Achievement[]`, each a pure predicate over lifetime `CareerStats`;
  achievements are derived at render time, never separately "unlocked" and stored.
- `utils/matchEngine.ts` — single-match simulation (`simulateMatch`), auto-lineup selection
  (`getAutoStarters`), and mid-match resume support (`SimulateMatchOptions`, used for live
  substitutions and extra time) used by both league and cup competitions.
- `utils/cupEngine.ts` / `utils/libertadoresEngine.ts` — bracket/phase state machines for the Copa do
  Brasil (60-club knockout, phases `FASE0`→`FINAL`) and Copa Libertadores (groups + knockout,
  fetched-in South American clubs), each layered on top of `matchEngine.ts`.
- `utils/loanEngine.ts` — the bank loan system (fixed-installment amortization, credit limit derived
  from a financial score); one loan "period" is one league round.
- `utils/nativeServices.ts` — thin wrapper around the single native Capacitor plugin (Game Center,
  iCloud save mirroring, StoreKit, AdMob init/show). Every export is `isNative()`-guarded and never
  throws, so the web build (and Capacitor's browser dev mode) is always a safe no-op.
- `utils/ads.ts` — interstitial-ad policy on top of `nativeServices.ts` (only after a match ends, at
  most once per 4 minutes, skipped entirely for Premium users).

### Static/runtime data (`public/data/`)

`public/data/foreign_players.json` (European league flavor market) and
`public/data/libertadores_clubs.json` (real South American club squads) are fetched once at runtime
by `GameContext.tsx` — they are not bundled into the JS. The root-level `bra1_rosters.json`,
`espn_rosters.json`, `refactor.cjs`, and `refactor2.cjs` are **not** part of the build or runtime;
they're leftover one-off scripts/data used historically to hand-generate roster data that ended up
baked into `database.ts`. Don't wire them into the app without checking whether they're still needed.

### Persistence

Saves live in `localStorage` under `retrofoot_2026_save_slot_{1..4}` (4 slots, but non-Premium
players only ever get slot 1 — see `getFreeSlot()`), mirrored best-effort to iCloud KV storage on
iOS. `App.tsx`'s one-time module-load migration copies any old `elifoot_2026_*` keys to
`retrofoot_2026_*` so a rename never wipes existing players' progress — keep that migration in mind if
save keys are renamed again. Saves are size-sensitive: `slimOldMatchEvents` strips full match-event
detail from rounds older than the last 2 (nothing reads that far back), and `saveGame` degrades
gracefully (dropping old news, then warning the user once) rather than losing the whole save if
`localStorage` quota is hit.

## Conventions

- **Design docs precede non-trivial features.** `docs/superpowers/specs/YYYY-MM-DD-<feature>-design.md`
  holds a written-in-Portuguese design doc (context, decisions, module sketch) for each major feature
  before/while it's implemented — see the existing ones for Libertadores, the medical department,
  Premium IAP, and ads monetization. Add a new one in the same style for comparably-sized features.
- **Comments explain the non-obvious "why," extensively.** This codebase leans heavily on comments
  that document a hidden invariant, a calibration constant's derivation, or the reason a workaround
  exists (e.g. the ref-mirroring pattern above, or the native-plugin registration quirk) — match that
  style rather than narrating what the code obviously does.
- **Commit messages are in Portuguese**, describing the change (e.g. `Corrige trava permanente da
  Copa/Libertadores para jogador sem Premium`).
- Gameplay constants (injury chances, prize money, division multipliers, etc.) are defined as named
  `UPPER_SNAKE_CASE` constants near their point of use with a comment on how they were derived —
  follow that pattern instead of inlining magic numbers.
