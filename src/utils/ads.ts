import { initNativeAds, showInterstitialAd } from './nativeServices';

// Real interstitial ad unit ID from the AdMob console (Retrofoot 2026, iOS -- "Interstitial
// Pos-Partida"). Google's own test ad unit ID is 'ca-app-pub-3940256099942544/4411468910',
// useful again if this ever needs to go back to always-test-ads mode for local development.
const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-9207064721204036/8667639689';

// Show an interstitial once every N played matches instead of after every single one -- much
// less intrusive than a time-based cooldown, since it doesn't matter how fast or slow the player
// moves through rounds. Cup/Libertadores ties auto-resolve without an interactive match for
// non-Premium players (see GameContext), so in practice this only counts league rounds for them.
const MATCHES_BETWEEN_ADS = 3;

let matchesSinceLastAd = 0;
let adInFlight = false;

/** Initializes the ads SDK once. Silent no-op outside iOS. */
export async function initAds(): Promise<void> {
  await initNativeAds();
}

/**
 * Shows a full-screen interstitial ad after every Nth match ends, unless the player has Premium.
 * Never throws, never blocks the game flow.
 */
export async function maybeShowInterstitialAfterMatch(isPremium: boolean): Promise<void> {
  if (isPremium || adInFlight) return;
  matchesSinceLastAd++;
  if (matchesSinceLastAd < MATCHES_BETWEEN_ADS) return;
  adInFlight = true;
  try {
    // npa: non-personalized ads -- no App Tracking Transparency prompt needed.
    const shown = await showInterstitialAd(INTERSTITIAL_AD_UNIT_ID, true);
    // Only a real impression resets the counter: an ad that failed to load (offline, no fill)
    // shouldn't cost the player-facing quiet period *and* the next chance to show one.
    if (shown) matchesSinceLastAd = 0;
  } finally {
    adInFlight = false;
  }
}
