import Foundation
import Capacitor
import EventKit
import EventKitUI

/// Puts an event into the phone's calendar through the system's own "new event" screen, filled in: the user picks the calendar and
/// saves there (no calendar permission is needed for that screen, and the app never reads the calendar).
@objc(CalendarPlugin)
public class CalendarPlugin: CAPPlugin, CAPBridgedPlugin, EKEventEditViewDelegate {
    public let identifier = "CalendarPlugin"
    public let jsName = "Calendar"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "insert", returnType: CAPPluginReturnPromise)]
    private let store = EKEventStore()
    private var pending: CAPPluginCall?

    @objc func insert(_ call: CAPPluginCall) {
        let start = call.getDouble("start") ?? Date().timeIntervalSince1970 * 1000
        let end = call.getDouble("end") ?? (start + 3_600_000)
        let allDay = call.getBool("allDay") ?? false
        DispatchQueue.main.async {
            let event = EKEvent(eventStore: self.store)
            event.title = call.getString("title") ?? ""
            event.startDate = Date(timeIntervalSince1970: start / 1000)
            event.endDate = Date(timeIntervalSince1970: (allDay ? end - 1000 : end) / 1000)   // (an all-day event ends on its last day)
            event.isAllDay = allDay
            event.notes = call.getString("notes")
            event.location = call.getString("location")
            let vc = EKEventEditViewController()
            vc.eventStore = self.store
            vc.event = event
            vc.editViewDelegate = self
            self.pending = call
            guard let host = self.bridge?.viewController else { call.reject("No screen"); return }
            host.present(vc, animated: true)
        }
    }

    public func eventEditViewController(_ controller: EKEventEditViewController, didCompleteWith action: EKEventEditViewAction) {
        controller.dismiss(animated: true)
        pending?.resolve(["added": action == .saved])
        pending = nil
    }
}
