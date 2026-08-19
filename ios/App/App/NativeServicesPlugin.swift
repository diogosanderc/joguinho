import Foundation
import Capacitor
import GameKit
import StoreKit
import GoogleMobileAds
import UserMessagingPlatform

private let premiumProductId = "com.diogosander.retrofoot.premium"

@objc(NativeServicesPlugin)
public class NativeServicesPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeServicesPlugin"
    public let jsName = "NativeServices"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticateGameCenter", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isGameCenterAuthenticated", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showAchievements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudSetSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudGetSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudRemoveSave", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cloudListKeys", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchasePremium", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPremiumUnlocked", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "initAds", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showInterstitialAd", returnType: CAPPluginReturnPromise)
    ]

    private var interstitialAd: InterstitialAd?

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

    // MARK: - Premium (single non-consumable IAP unlocking Serie A, extra save slots,
    // Medical Dept/Youth Academy upgrades, and playing Cup/Libertadores/National Team matches)

    @objc func purchasePremium(_ call: CAPPluginCall) {
        Task {
            do {
                NSLog("🟡 [Premium] Buscando produto \(premiumProductId)...")
                let products = try await Product.products(for: [premiumProductId])
                NSLog("🟡 [Premium] Produtos encontrados: \(products.count) -- \(products.map { $0.id })")
                guard let product = products.first else {
                    NSLog("🔴 [Premium] Produto NAO encontrado")
                    call.reject("Produto Premium não encontrado")
                    return
                }
                NSLog("🟡 [Premium] Iniciando compra de \(product.id)...")
                let result = try await product.purchase()
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        NSLog("🟢 [Premium] Compra verificada com sucesso")
                        await transaction.finish()
                        call.resolve(["purchased": true])
                    case .unverified(_, let error):
                        NSLog("🔴 [Premium] Compra NAO verificada: \(error.localizedDescription)")
                        call.reject("Não foi possível verificar a compra")
                    }
                case .userCancelled:
                    NSLog("🟡 [Premium] Usuario cancelou a compra")
                    call.resolve(["purchased": false])
                case .pending:
                    NSLog("🟡 [Premium] Compra pendente")
                    call.resolve(["purchased": false])
                @unknown default:
                    NSLog("🟡 [Premium] Resultado desconhecido da compra")
                    call.resolve(["purchased": false])
                }
            } catch {
                NSLog("🔴 [Premium] Erro na compra: \(error)")
                call.reject("Falha na compra: \(error.localizedDescription)")
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let unlocked = await NativeServicesPlugin.hasPremiumEntitlement()
                call.resolve(["restored": unlocked])
            } catch {
                call.reject("Falha ao restaurar compras: \(error.localizedDescription)")
            }
        }
    }

    @objc func isPremiumUnlocked(_ call: CAPPluginCall) {
        Task {
            let unlocked = await NativeServicesPlugin.hasPremiumEntitlement()
            call.resolve(["unlocked": unlocked])
        }
    }

    private static func hasPremiumEntitlement() async -> Bool {
        for await result in Transaction.currentEntitlements {
            if case .verified(let transaction) = result, transaction.productID == premiumProductId {
                return true
            }
        }
        return false
    }

    // MARK: - Ads (Google Mobile Ads SDK, used directly -- not through @capacitor-community/admob,
    // whose only Capacitor-6-compatible release points at an unpinned, since-drifted SDK branch)

    // Google's User Messaging Platform (UMP) SDK -- ships bundled with GoogleMobileAds and is
    // required by Google's own AdMob policy before requesting ads, so that users in the
    // EEA/UK/Switzerland get a consent form when one applies. The app only ever requests
    // non-personalized ads regardless of the outcome (see showInterstitialAd's npa flag), but
    // the consent gathering step itself is still mandatory -- it's what determines whether a
    // regulated user needs to see the message in the first place, not something this app can
    // opt out of by already defaulting to non-personalized.
    @objc func initAds(_ call: CAPPluginCall) {
        let parameters = UMPRequestParameters()
        parameters.tagForUnderAgeOfConsent = false

        UMPConsentInformation.sharedInstance.requestConsentInfoUpdate(with: parameters) { [weak self] requestError in
            guard let self = self else { return }
            if let requestError = requestError {
                // Consent status couldn't be determined (e.g. offline) -- fall back to starting
                // the ads SDK anyway rather than blocking the app on a network hiccup; ads stay
                // non-personalized either way.
                print("UMP requestConsentInfoUpdate failed: \(requestError.localizedDescription)")
                MobileAds.shared.start { _ in call.resolve() }
                return
            }

            guard let vc = self.bridge?.viewController else {
                MobileAds.shared.start { _ in call.resolve() }
                return
            }
            UMPConsentForm.loadAndPresentIfRequired(from: vc) { loadError in
                if let loadError = loadError {
                    print("UMP loadAndPresentIfRequired failed: \(loadError.localizedDescription)")
                }
                MobileAds.shared.start { _ in call.resolve() }
            }
        }
    }

    @objc func showInterstitialAd(_ call: CAPPluginCall) {
        guard let adId = call.getString("adId") else {
            call.reject("adId is required")
            return
        }
        let request = Request()
        if call.getBool("npa") == true {
            let extras = Extras()
            extras.additionalParameters = ["npa": "1"]
            request.register(extras)
        }
        InterstitialAd.load(with: adId, request: request) { [weak self] ad, error in
            guard let self = self else { return }
            if let error = error {
                call.reject("Failed to load interstitial: \(error.localizedDescription)")
                return
            }
            guard let ad = ad else {
                call.reject("Failed to load interstitial")
                return
            }
            self.interstitialAd = ad
            DispatchQueue.main.async {
                guard let vc = self.bridge?.viewController else {
                    // Nothing was actually shown -- resolving here would let the JS side start its
                    // "an ad just played" cooldown for an impression that never happened.
                    self.interstitialAd = nil
                    call.reject("No view controller available to present the ad")
                    return
                }
                ad.present(from: vc)
                call.resolve()
            }
        }
    }
}

extension NativeServicesPlugin: GKGameCenterControllerDelegate {
    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true, completion: nil)
    }
}
