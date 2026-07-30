//
//  DeviceActivityMonitorExtension.swift
//  Ampora Ignition — DeviceActivityMonitor extension target (docs/05 §3.5).
//
//  Registered as the `AmporaDeviceActivityMonitor` app-extension target by
//  `../../../plugin/withExtensionTargets.js`. Fires scheduling callbacks so
//  the shield applies/releases even while Ampora is not running.
//
//  Two FIXED `DeviceActivityName`s carry every backstop this module needs
//  (see `AmporaIgnitionModule.swift`, which schedules them):
//    - "ignition.expiry": ends at the session-length / daily-cap /
//      single-session-cap / quiet-hours deadline -> `intervalDidEnd` releases.
//    - "ignition.arm": STARTS at a `trigger: 'scheduled'` stake's arm moment
//      (scheduledAt + startWindowMin) -> `intervalDidStart` applies the
//      shield, for the "Backgrounded" / "Killed" rows of the auto-arm table
//      (ARCH_PLAN A4) where nothing in-app is running to do it.
//
//  THE IN-APP WALL CLOCK IS THE SOURCE OF TRUTH (docs/05 §3.5). This
//  extension is a backstop for when the app is closed — threshold events can
//  fire prematurely on some iOS versions, and Low Power Mode can suppress
//  event reporting. Never assume this extension is the only thing that ever
//  released or armed a shield; the app re-validates on every launch/foreground.
//
//  FAIL-SAFE (docs/05 §3.10): release paths (`intervalDidEnd`,
//  `eventDidReachThreshold`) always clear the shield unconditionally, even if
//  nothing was actually shielded — a redundant clear is a no-op, a missed one
//  is a trapped user. The arm path (`intervalDidStart`) is the mirror image:
//  it only APPLIES a shield when authorization and the pending selection are
//  BOTH positively confirmed; anything uncertain leaves the device unshielded
//  rather than risk a bad apply with nobody watching.
//
import DeviceActivity
import FamilyControls
import ManagedSettings
import Foundation

private let expiryActivityName = DeviceActivityName("ignition.expiry")
private let armActivityName = DeviceActivityName("ignition.arm")
/// Kept in sync BY HAND with `AmporaIgnitionModule.expiryEventName` — this
/// extension target cannot import the main app target's private members.
private let expiryEventName = DeviceActivityEvent.Name("ignition.expiry.event")

final class AmporaDeviceActivityMonitorExtension: DeviceActivityMonitor {
    // A NAMED store, using the EXACT SAME name AmporaIgnitionModule.swift
    // uses. ManagedSettingsStore is scoped by name within the App Group, not
    // by process, so this reaches the identical shield the app applied.
    private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("AmporaIgnitionShield"))

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)

        guard activity == armActivityName else { return }

        // The scheduled-trigger arm moment (docs/05 §3.5). Apply the shield
        // ONLY if authorization and a decodable pending selection are both
        // positively confirmed — anything else leaves the device unshielded
        // (fail-safe direction, docs/05 §3.10) since there is nobody watching
        // to notice a bad apply right now.
        guard AuthorizationCenter.shared.authorizationStatus == .approved else {
            AppGroupStore.log("monitor.intervalDidStart(arm): authorization not approved, not arming")
            return
        }
        guard let selectionId = AppGroupStore.scheduledArmSelectionId(),
              let selection = AppGroupStore.loadSelection(id: selectionId)
        else {
            AppGroupStore.log("monitor.intervalDidStart(arm): no valid pending selection, not arming")
            return
        }

        AppGroupStore.applyShield(store: store, selection: selection)
        // Consumed: a one-shot arm should not silently re-fire the same
        // selection if this extension is ever invoked again for any reason.
        AppGroupStore.setScheduledArmSelectionId(nil)
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)

        guard activity == expiryActivityName else { return }
        // The window ended: session length reached, or the daily-cap /
        // single-session-cap / quiet-hours auto-expiry monitor fired.
        // Unconditional release — never leave the user trapped (docs/05 §3.10).
        AppGroupStore.removeShield(store: store)
    }

    override func eventDidReachThreshold(_ event: DeviceActivityEvent.Name, for activity: DeviceActivityName) {
        super.eventDidReachThreshold(event, for: activity)

        guard activity == expiryActivityName, event == expiryEventName else { return }
        // Redundant path to the SAME outcome as intervalDidEnd above.
        // docs/05 §3.5 treats "eventDidReachThreshold / intervalDidEnd" as
        // interchangeable release signals precisely because threshold events
        // (and interval-end callbacks) are each independently known to be
        // unreliable on some iOS versions / under Low Power Mode. Releasing
        // twice is a harmless no-op; missing the only release path is a
        // trapped user.
        AppGroupStore.removeShield(store: store)
    }
}
