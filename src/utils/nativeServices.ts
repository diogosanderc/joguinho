import { registerPlugin } from '@capacitor/core';

interface NativeServicesPlugin {
  authenticateGameCenter(): Promise<{ authenticated: boolean; playerId?: string; displayName?: string }>;
  isGameCenterAuthenticated(): Promise<{ authenticated: boolean }>;
  submitScore(options: { leaderboardId: string; value: number }): Promise<void>;
  reportAchievement(options: { achievementId: string; percentComplete?: number }): Promise<void>;
  showLeaderboard(): Promise<void>;
  showAchievements(): Promise<void>;
  cloudSetSave(options: { key: string; value: string }): Promise<void>;
  cloudGetSave(options: { key: string }): Promise<{ value: string | null }>;
  cloudRemoveSave(options: { key: string }): Promise<void>;
  cloudListKeys(): Promise<{ keys: string[] }>;
  purchasePremium(): Promise<{ purchased: boolean }>;
  restorePurchases(): Promise<{ restored: boolean }>;
  isPremiumUnlocked(): Promise<{ unlocked: boolean }>;
  initAds(): Promise<void>;
  showInterstitialAd(options: { adId: string; npa?: boolean }): Promise<void>;
}

const NativeServices = registerPlugin<NativeServicesPlugin>('NativeServices');

const CLOUD_KEY_PREFIXES = ['retrofoot_2026_save_slot_', 'retrofoot_2026_tactics_slot_'];

function isNative(): boolean {
  try {
    return (window as any).Capacitor?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Authenticates the local player with Game Center. Silent no-op outside iOS. */
export async function authenticateGameCenter() {
  if (!isNative()) return null;
  try {
    const result = await NativeServices.authenticateGameCenter();
    // TEMP DIAGNOSTIC (remove once Game Center is confirmed working): shows the auth result
    // on-screen via alert(), since the OS "Welcome" banner is easy to miss/hard to debug.
    alert(`[DIAG GameCenter] authenticated=${result.authenticated} displayName=${result.displayName ?? 'null'}`);
    return result;
  } catch (e) {
    alert(`[DIAG GameCenter] auth threw: ${String(e)}`);
    console.warn('Game Center authentication failed', e);
    return null;
  }
}

export async function submitLeaderboardScore(leaderboardId: string, value: number) {
  if (!isNative()) return;
  try {
    await NativeServices.submitScore({ leaderboardId, value });
  } catch (e) {
    console.warn('Game Center submitScore failed', e);
  }
}

export async function reportGameCenterAchievement(achievementId: string, percentComplete = 100) {
  if (!isNative()) return;
  try {
    await NativeServices.reportAchievement({ achievementId, percentComplete });
  } catch (e) {
    console.warn('Game Center reportAchievement failed', e);
  }
}

export async function showGameCenterLeaderboard() {
  if (!isNative()) return;
  try {
    await NativeServices.showLeaderboard();
  } catch (e) {
    console.warn('Game Center showLeaderboard failed', e);
  }
}

export async function showGameCenterAchievements() {
  if (!isNative()) return;
  try {
    await NativeServices.showAchievements();
  } catch (e) {
    console.warn('Game Center showAchievements failed', e);
  }
}

/** Best-effort mirror of a localStorage save key into iCloud Key-Value storage. Never throws. */
export function mirrorSaveToCloud(key: string, value: string) {
  if (!isNative()) return;
  NativeServices.cloudSetSave({ key, value }).catch(e => console.warn('cloud save mirror failed', e));
}

export function removeCloudSave(key: string) {
  if (!isNative()) return;
  NativeServices.cloudRemoveSave({ key }).catch(e => console.warn('cloud save removal failed', e));
}

/**
 * Pulls any save/tactics slots that exist in iCloud but not on this device into localStorage --
 * used on cold start so a reinstall or a new device picks up prior progress. Never overwrites a
 * slot that already has local data, so it can't clobber progress made on this device.
 */
export async function restoreSavesFromCloud(): Promise<number> {
  if (!isNative()) return 0;
  try {
    const { keys } = await NativeServices.cloudListKeys();
    let restored = 0;
    for (const key of keys) {
      if (!CLOUD_KEY_PREFIXES.some(prefix => key.startsWith(prefix))) continue;
      if (localStorage.getItem(key)) continue;
      const { value } = await NativeServices.cloudGetSave({ key });
      if (value) {
        localStorage.setItem(key, value);
        restored++;
      }
    }
    return restored;
  } catch (e) {
    console.warn('restoreSavesFromCloud failed', e);
    return 0;
  }
}

// --- Premium (single non-consumable IAP) -----------------------------------------------

/** Initiates the Premium purchase flow. Returns false (never throws) outside the native app. */
export async function purchasePremium(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await NativeServices.purchasePremium()).purchased;
  } catch (e) {
    console.warn('purchasePremium failed', e);
    return false;
  }
}

/** Restores a previous Premium purchase. Returns false (never throws) outside the native app. */
export async function restorePurchases(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await NativeServices.restorePurchases()).restored;
  } catch (e) {
    console.warn('restorePurchases failed', e);
    return false;
  }
}

/**
 * Checks the current Premium entitlement via StoreKit. Always returns false outside the native
 * app, and on any error -- an error here must never accidentally unlock Premium.
 */
export async function isPremiumUnlocked(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    return (await NativeServices.isPremiumUnlocked()).unlocked;
  } catch (e) {
    console.warn('isPremiumUnlocked failed', e);
    return false;
  }
}

// --- Ads (Google Mobile Ads SDK) --------------------------------------------------------

/** Initializes the Google Mobile Ads SDK once. Silent no-op outside iOS. */
export async function initNativeAds(): Promise<void> {
  if (!isNative()) return;
  try {
    await NativeServices.initAds();
  } catch (e) {
    console.warn('initAds failed', e);
  }
}

/** Loads and shows a full-screen interstitial ad. Never throws, silent no-op outside iOS. */
export async function showInterstitialAd(adId: string, npa: boolean): Promise<void> {
  if (!isNative()) return;
  try {
    await NativeServices.showInterstitialAd({ adId, npa });
  } catch (e) {
    console.warn('showInterstitialAd failed', e);
  }
}
