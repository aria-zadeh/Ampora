//
//  DeviceActivityMonitor.swift
//  Ampora — Ignition (ISOLATED reference scaffolding, NOT in the build)
//
//  Skeleton for the DeviceActivityMonitor app-extension target. Created by the
//  config plugin (see ampora-ignition.plugin.js) once IGNITION_NATIVE is
//  enabled. Fires scheduling callbacks so a Beat-the-clock timer / cooldown
//  and the daily-cap + quiet-hours auto-expiry release even while the app is
//  closed (docs/06 §3.5, §3.6).
//
//  This file is documentation. It is not compiled by the RN/TS build and must
//  not be imported from app code. Requires the com.apple.developer.deviceactivity
//  and com.apple.developer.managedsettings entitlements + the shared App Group.
//

import DeviceActivity
import ManagedSettings
import Foundation

// The shared ManagedSettings store; the app and every extension mutate the SAME
// store (keyed by the App Group) so a shield applied here is the shield the app
// sees, and vice versa (docs/06 §3.5).
private let store = ManagedSettingsStore()

// App Group container the app writes session state into (mode, condition,
// startedAt, strength, caps) so this extension can enforce wall-clock rules as
// a backstop. Never rely on the extension alone for correctness — the in-app
// wall clock is the source of truth (docs/06 §3.5).
private let appGroupId = "group.com.ampora.blocker"

final class AmporaDeviceActivityMonitor: DeviceActivityMonitor {

    override func intervalDidStart(for activity: DeviceActivityName) {
        super.intervalDidStart(for: activity)
        // A scheduled lock window began (e.g. a Beat-the-clock cooldown). Apply
        // the shield for the tokens persisted in the App Group.
        //
        //   let selection = loadSelection(fromAppGroup: appGroupId)
        //   store.shield.applications = selection.applicationTokens
        //   store.shield.applicationCategories = .specific(selection.categoryTokens)
        //   store.shield.webDomains = selection.webDomainTokens
    }

    override func intervalDidEnd(for activity: DeviceActivityName) {
        super.intervalDidEnd(for: activity)
        // The window ended (cooldown lapsed, or the daily-cap / quiet-hours
        // auto-expiry monitor fired). Remove the shield. Fail-safe: on any
        // error, clear the shield anyway — never leave the user trapped
        // (docs/06 §3.10).
        //
        //   store.shield.applications = nil
        //   store.shield.applicationCategories = nil
        //   store.shield.webDomains = nil
        //   clearSessionState(inAppGroup: appGroupId)
    }

    override func eventDidReachThreshold(
        _ event: DeviceActivityEvent.Name,
        for activity: DeviceActivityName
    ) {
        super.eventDidReachThreshold(event, for: activity)
        // A threshold event fired (e.g. Beat-the-clock timer elapsed without a
        // First-move completion). Apply the bounded cooldown shield here as a
        // backstop, but the app's wall clock remains authoritative. Threshold
        // events can fire prematurely on some iOS versions + Low Power Mode can
        // suppress them, so treat this as a backstop only (docs/06 §3.5).
    }
}
