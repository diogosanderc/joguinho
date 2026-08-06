import { initNativeAds, showInterstitialAd } from './nativeServices';

// Real interstitial ad unit ID from the AdMob console (Retrofoot 2026, iOS -- "Interstitial
// Pos-Partida"). Google's own test ad unit ID is 'ca-app-pub-3940256099942544/4411468910',
// useful again if this ever needs to go back to always-test-ads mode for local development.
const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-9207064721204036/8667639689';

const MIN_INTERVAL_MS = 4 * 60 * 1000;

let lastAdShownAt = 0;
let adInFlight = false;

/** Initializes the ads SDK once. Silent no-op outside iOS. */
export async function initAds(): Promise<void> {
  await initNativeAds();
}

/**
 * Shows a full-screen interstitial ad after a match ends, unless the player has Premium, or
 * an ad was already shown within the last few minutes (avoids stacking ads during weeks with
 * several matches -- league + cup + Libertadores). Never throws, never blocks the game flow.
 */
export async function maybeShowInterstitialAfterMatch(isPremium: boolean): Promise<void> {
  if (isPremium || adInFlight) return;
  if (Date.now() - lastAdShownAt < MIN_INTERVAL_MS) return;
  adInFlight = true;
  try {
    // npa: non-personalized ads -- no App Tracking Transparency prompt needed.
    const shown = await showInterstitialAd(INTERSTITIAL_AD_UNIT_ID, true);
    // Only a real impression starts the cooldown: an ad that failed to load (offline, no fill)
    // shouldn't cost the player-facing quiet period *and* the next chance to show one.
    if (shown) lastAdShownAt = Date.now();
  } finally {
    adInFlight = false;
  }
}
