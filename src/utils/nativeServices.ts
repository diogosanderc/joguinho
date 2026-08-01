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
    return await NativeServices.authenticateGameCenter();
  } catch (e) {
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
