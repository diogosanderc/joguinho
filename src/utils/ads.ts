import { AdMob } from '@capacitor-community/admob';

// Google's official TEST ad unit IDs -- always fill, safe to ship during development, never
// serve real ads. Swap both of these (and set isTesting to false below) for the real values
// from the AdMob console before submitting to the App Store.
const INTERSTITIAL_AD_UNIT_ID = 'ca-app-pub-3940256099942544/4411468910';
const USE_TEST_ADS = true;

const MIN_INTERVAL_MS = 4 * 60 * 1000;

let initialized = false;
let lastAdShownAt = 0;

function isNative(): boolean {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Initializes the AdMob SDK once. Silent no-op outside iOS. */
export async function initAds(): Promise<void> {
  if (!isNative() || initialized) return;
  try {
    await AdMob.initialize();
    initialized = true;
  } catch (e) {
    console.warn('AdMob initialize failed', e);
  }
}

/**
 * Shows a full-screen interstitial ad after a match ends, unless the player has Premium, or
 * an ad was already shown within the last few minutes (avoids stacking ads during weeks with
 * several matches -- league + cup + Libertadores). Never throws, never blocks the game flow.
 */
export async function maybeShowInterstitialAfterMatch(isPremium: boolean): Promise<void> {
  if (isPremium || !isNative()) return;
  if (Date.now() - lastAdShownAt < MIN_INTERVAL_MS) return;
  try {
    await AdMob.prepareInterstitial({
      adId: INTERSTITIAL_AD_UNIT_ID,
      isTesting: USE_TEST_ADS,
      npa: true, // non-personalized ads -- no App Tracking Transparency prompt needed
    });
    await AdMob.showInterstitial();
    lastAdShownAt = Date.now();
  } catch (e) {
    console.warn('AdMob interstitial failed', e);
  }
}
