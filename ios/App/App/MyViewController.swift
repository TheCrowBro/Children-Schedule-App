import UIKit
import Capacitor

/// The app's web view, with the app's own plugins registered (the Calendar plugin; the Files-app folder plugin for iCloud Drive; the
/// status-bar insets come from env() on iOS).
class MyViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CalendarPlugin())
        bridge?.registerPluginInstance(FolderPlugin())
    }
}
