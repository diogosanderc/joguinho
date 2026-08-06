import Capacitor

// Explicitly registers NativeServicesPlugin instead of relying on Capacitor's automatic
// CAPBridgedPlugin discovery -- in this SPM-based project, automatic discovery alone wasn't
// picking up the custom plugin ("plugin is not implemented on ios" at call time even though
// the class conforms to CAPBridgedPlugin), so it's registered explicitly here as a fallback.
class BridgeViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeServicesPlugin())
    }
}
