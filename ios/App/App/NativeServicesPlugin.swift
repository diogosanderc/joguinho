import Foundation
import Capacitor
import GameKit

@objc(NativeServicesPlugin)
public class NativeServicesPlugin: CAPPlugin {

    @objc func authenticateGameCenter(_ call: CAPPluginCall) {
        let localPlayer = GKLocalPlayer.local
        localPlayer.authenticateHandler = { [weak self] viewController, error in
            if let vc = viewController {
                DispatchQueue.main.async {
                    self?.bridge?.viewController?.present(vc, animated: true, completion: nil)
                }
                return
            }
            if let error = error {
                call.reject("Game Center auth failed: \(error.localizedDescription)")
                return
            }
            call.resolve([
                "authenticated": localPlayer.isAuthenticated,
                "playerId": localPlayer.gamePlayerID,
                "displayName": localPlayer.displayName
            ])
        }
    }

    @objc func isGameCenterAuthenticated(_ call: CAPPluginCall) {
        call.resolve(["authenticated": GKLocalPlayer.local.isAuthenticated])
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not authenticated with Game Center")
            return
        }
        guard let leaderboardId = call.getString("leaderboardId") else {
            call.reject("leaderboardId is required")
            return
        }
        let value = call.getInt("value") ?? 0
        GKLeaderboard.submitScore(value, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [leaderboardId]) { error in
            if let error = error {
                call.reject("Failed to submit score: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func reportAchievement(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not authenticated with Game Center")
            return
        }
        guard let achievementId = call.getString("achievementId") else {
            call.reject("achievementId is required")
            return
        }
        let percent = call.getDouble("percentComplete") ?? 100.0
        let achievement = GKAchievement(identifier: achievementId)
        achievement.percentComplete = percent
        achievement.showsCompletionBanner = true
        GKAchievement.report([achievement]) { error in
            if let error = error {
                call.reject("Failed to report achievement: \(error.localizedDescription)")
            } else {
                call.resolve()
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not authenticated with Game Center")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let gcVC = GKGameCenterViewController(state: .leaderboards)
            gcVC.gameCenterDelegate = self
            self.bridge?.viewController?.present(gcVC, animated: true, completion: nil)
        }
        call.resolve()
    }

    @objc func showAchievements(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated else {
            call.reject("Not authenticated with Game Center")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            let gcVC = GKGameCenterViewController(state: .achievements)
            gcVC.gameCenterDelegate = self
            self.bridge?.viewController?.present(gcVC, animated: true, completion: nil)
        }
        call.resolve()
    }

    // MARK: - iCloud key-value save sync (mirrors localStorage save slots for cross-device backup)

    @objc func cloudSetSave(_ call: CAPPluginCall) {
        guard let key = call.getString("key"), let value = call.getString("value") else {
            call.reject("key and value are required")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        store.set(value, forKey: key)
        store.synchronize()
        call.resolve()
    }

    @objc func cloudGetSave(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        store.synchronize()
        call.resolve(["value": store.string(forKey: key) as Any])
    }

    @objc func cloudRemoveSave(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else {
            call.reject("key is required")
            return
        }
        let store = NSUbiquitousKeyValueStore.default
        store.removeObject(forKey: key)
        store.synchronize()
        call.resolve()
    }

    @objc func cloudListKeys(_ call: CAPPluginCall) {
        let store = NSUbiquitousKeyValueStore.default
        store.synchronize()
        call.resolve(["keys": Array(store.dictionaryRepresentation.keys)])
    }
}

extension NativeServicesPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true, completion: nil)
    }
}
