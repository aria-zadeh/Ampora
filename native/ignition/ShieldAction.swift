//
//  ShieldAction.swift
//  Ampora — Ignition (ISOLATED reference scaffolding, NOT in the build)
//
//  Skeleton for the ShieldAction app-extension target: handles taps on the
//  block screen's buttons (docs/06 §3.8). The extension cannot show rich UI
//  and cannot launch another app, so the 60s panic-valve friction and
//  de-escalation happen in the app, not here. This just records intent and
//  nudges the user back into Ampora.
//
//  Documentation only: not compiled by the RN/TS build, not imported from app
//  code. Requires the Family Controls entitlement + shared App Group.
//

import ManagedSettings
import UserNotifications
import Foundation

private let appGroupId = "group.com.ampora.blocker"

final class AmporaShieldActionHandler: ShieldActionDelegate {

    override func handle(
        action: ShieldAction,
        for application: ApplicationToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        switch action {
        case .primaryButtonPressed:
            // "Open Ampora": we cannot launch the app from here, so post a local
            // notification that deep-links to the active session, and DEFER
            // (keep the shield up — the notification pulls the user back).
            postOpenAmporaNotification()
            completionHandler(.defer)

        case .secondaryButtonPressed:
            // "Unlock early": write the panic-valve intent into the App Group.
            // The APP shows the 60s friction countdown + calm copy and, if the
            // user waits it out, calls stakesStore.panicValve() to remove the
            // shield and de-escalate. DEFER here (do not unlock instantly).
            writePanicValveIntent(toAppGroup: appGroupId)
            postOpenAmporaNotification()
            completionHandler(.defer)

        @unknown default:
            // Fail-safe: an unknown action must not trap the user. Close so the
            // system does not hold them on the shield indefinitely.
            completionHandler(.close)
        }
    }

    override func handle(
        action: ShieldAction,
        for webDomain: WebDomainToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        handle(action: action, for: unsafeBitCast(webDomain, to: ApplicationToken.self),
               completionHandler: completionHandler)
    }

    override func handle(
        action: ShieldAction,
        for category: ActivityCategoryToken,
        completionHandler: @escaping (ShieldActionResponse) -> Void
    ) {
        // Same routing as the per-application handler.
        completionHandler(.defer)
    }

    // MARK: - Helpers (sketch)

    private func postOpenAmporaNotification() {
        // let content = UNMutableNotificationContent()
        // content.title = "Back to your task"
        // content.body = "Tap to finish your first move and unlock."
        // content.userInfo = ["deepLink": "ampora://ignition/active"]
        // UNUserNotificationCenter.current().add(UNNotificationRequest(...))
    }

    private func writePanicValveIntent(toAppGroup groupId: String) {
        // UserDefaults(suiteName: groupId)?.set(Date().timeIntervalSince1970,
        //                                       forKey: "panicValveRequestedAt")
    }
}
