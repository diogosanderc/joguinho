import { initNativeAds, showInterstitialAd } from './nativeServices';

// Google's official TEST interstitial ad unit ID -- always fills, safe to ship during
// development, never serves real ads. Swap this for the real Ad Unit ID from the AdMob
// console before submitting to the App Store.
const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910';

const MIN_INTERVAL_MS = 4 * 60 * 1000;

let lastAdShownAt = 0;

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
  if (isPremium) return;
  if (Date.now() - lastAdShownAt < MIN_INTERVAL_MS) return;
  lastAdShownAt = Date.now();
  await showInterstitialAd(INTERSTITIAL_AD_UNIT_ID, true /* npa: non-personalized ads -- no App Tracking Transparency prompt needed */);
}
