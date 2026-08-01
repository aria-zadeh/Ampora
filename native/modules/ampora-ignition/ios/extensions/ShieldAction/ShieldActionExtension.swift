//
//  ShieldActionExtension.swift
//  Ampora Ignition — ShieldAction extension target (docs/05 §3.8, §3.9).
//
//  Registered as the `AmporaShieldAction` app-extension target by
//  `../../../plugin/withExtensionTargets.js`. Handles taps on the block
//  screen's two buttons. The extension cannot show rich UI and CANNOT launch
//  another app (docs/05 §1), so both actions end the same way: record intent,
//  post a local notification that deep-links back into Ampora, and `.defer`
//  (keep the shield up — the notification is what pulls the user back in, not
//  this handler).
//
//  "Open Ampora" is the on-ramp back into the active session. "Unlock early"
//  starts the 60s panic-valve friction, but THAT COUNTDOWN RUNS IN THE APP,
//  never here — this only writes the intent to the App Group
//  (`consumePendingPanicValveIntent()` on the TS side reads it on next
//  foreground, docs/05 §3.9) and nudges the user back in.
//
//  FAIL-SAFE (docs/05 §3.10): an unrecognized action `.close`s rather than
//  holding the user on the shield indefinitely with no way forward.
//
import Foundation
import ManagedSettings
import ManagedSettingsUI
import UserNotifications

final class AmporaShieldActionExtension: ShieldActionDelegate {

    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        respond(to: action, completionHandler: completionHandler)
    }

    override func handle(
        action: ShieldAction,
        for webDomain: WebDomainToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        respond(to: action, completionHandler: completionHandler)
    }

    override func handle(
        action: ShieldAction,
        for category: ActivityCategoryToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        respond(to: action, completionHandler: completionHandler)
    }

    // MARK: -

    /// The three overloads above all funnel here — which token type was
    /// tapped does not change the response; only the button that was pressed
    /// does. (The original skeleton this file replaced tried to share logic
    /// by `unsafeBitCast`-ing a `WebDomainToken` into an `ApplicationToken`,
    /// which is undefined behavior, not a real cast — routing by action
    /// through one shared, token-agnostic method is the correct fix.)
    private func respond(to action: ShieldAction, completionHandler: @escaping (ShieldActionResponse) -> Void) {
        switch action {
        case .primaryButtonPressed:
            // "Open Ampora": cannot launch the app from here (docs/05 §1), so
            // post a notification that deep-links to the active session and
            // DEFER — keep the shield up, the notification does the pulling.
            postOpenAmporaNotification(
                title: "Back to your task",
                body: "Tap to open Ampora and keep going.",
                deepLink: "ampora://ignition/active"
            )
            completionHandler(.defer)

        case .secondaryButtonPressed:
            // "Unlock early": write the panic-valve intent to the App Group.
            // The APP shows the 60s countdown + calm copy and, if the user
            // waits it out or confirms, calls the store's panic-valve action
            // to remove the shield and run de-escalation (docs/05 §3.9).
            // DEFER here too — never unlock instantly from the extension.
            AppGroupStore.writePanicValveIntent()
            postOpenAmporaNotification(
                title: "Ready to step away?",
                body: "Tap to open Ampora and confirm.",
                deepLink: "ampora://ignition/panic"
            )
            completionHandler(.defer)

        @unknown default:
            // Fail-safe: an unrecognized action must not trap the user on
            // the shield with no way forward (docs/05 §3.10).
            completionHandler(.close)
        }
    }

    private func postOpenAmporaNotification(title: String, body: String, deepLink: String) {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        content.userInfo = ["deepLink": deepLink]

        // `trigger: nil` delivers as soon as the system can, which for a
        // foreground-adjacent action like a shield tap is effectively
        // immediate — there is no meaningful "later" for this notification.
        let request = UNNotificationRequest(
            identifier: "ignition-open-ampora-\(UUID().uuidString)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request) { error in
            if let error {
                AppGroupStore.log("postOpenAmporaNotification failed: \(error)")
            }
        }
    }
}
