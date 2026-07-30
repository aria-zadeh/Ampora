//
//  AmporaIgnitionModule.swift
//  Ampora Ignition — the main Expo module (docs/05 §3).
//
//  Registered as "AmporaIgnition" (see expo-module.config.json). Resolved
//  from TS by NAME via `requireOptionalNativeModule<IgnitionNativeModule>
//  ('AmporaIgnition')` (core/blocking/nativeModule.ts) — never by a class
//  import, so Metro has nothing to statically resolve when this package is
//  not linked (ARCH_PLAN B6).
//
//  FAIL-SAFE, EVERYWHERE (docs/05 §3.10): almost every AsyncFunction below
//  catches its own errors and resolves a safe value/result rather than
//  letting a thrown Swift error become a rejected JS Promise. The ONE
//  intentional exception is `presentActivityPicker`, which rejects only when
//  there is truly no view to present from (`AmporaIgnitionError.noPresenter`)
//  — `NativeBlockingStrategy.pickStakeApps()` on the TS side already wraps
//  that call in its own try/catch and resolves an empty selection either way,
//  so the fail-safe direction is preserved one layer up even here.
//
import DeviceActivity
import ExpoModulesCore
import FamilyControls
import ManagedSettings
import SwiftUI
import UIKit

// Fixed DeviceActivity names (NOT per-session UUIDs). Apple caps the number
// of distinct activities an app can monitor at once, and a fixed name means
// `startMonitoring` on the same name simply supersedes whatever schedule was
// there before — which is exactly the BlockingStrategy contract's "calling
// `scheduleAutoExpiry` again REPLACES the previously scheduled expiry."
private let expiryActivityName = DeviceActivityName("ignition.expiry")
private let armActivityName = DeviceActivityName("ignition.arm")

private enum AmporaIgnitionError: Error {
    case noPresenter
}

public class AmporaIgnitionModule: Module {
    // A NAMED store (not the default unnamed one) so this module's shield can
    // never collide with some other ManagedSettings consumer that might ever
    // exist in the same App Group.
    private let store = ManagedSettingsStore(named: ManagedSettingsStore.Name("AmporaIgnitionShield"))
    private let activityCenter = DeviceActivityCenter()

    public func definition() -> ModuleDefinition {
        Name("AmporaIgnition")

        // MARK: - Authorization (docs/05 §3.1)

        AsyncFunction("getAuthorizationStatus") { () -> String in
            Self.mapAuthorizationStatus(AuthorizationCenter.shared.authorizationStatus)
        }

        AsyncFunction("requestAuthorization") { () async -> String in
            do {
                // `.individual`, NEVER `.child` — Ampora locks the user's OWN
                // device by their own choice (docs/05 §3.1), not a parent
                // managing a child's device. Using `.child` here would be a
                // product-integrity bug, not just a style choice.
                try await AuthorizationCenter.shared.requestAuthorization(for: .individual)
            } catch {
                AppGroupStore.log("requestAuthorization failed: \(error)")
            }
            // Read the status back regardless of whether the request
            // succeeded, denied, or threw — the caller always gets a real
            // status, never has to guess from a thrown error (fail-safe).
            return Self.mapAuthorizationStatus(AuthorizationCenter.shared.authorizationStatus)
        }

        // MARK: - Picker (docs/05 §2, §3.2)

        AsyncFunction("presentActivityPicker") { (previousSelectionId: String?) async throws -> [String: Any] in
            try await self.presentActivityPicker(previousSelectionId: previousSelectionId)
        }

        // MARK: - Shield (docs/05 §3.3, §3.4, §3.10)

        AsyncFunction("applyShield") { (selectionId: String) -> [String: Any] in
            self.applyShield(selectionId: selectionId)
        }

        AsyncFunction("removeShield") { () -> Void in
            // Unconditional and idempotent (docs/05 §3.4). Also cancels a
            // pending expiry backstop: once the shield is down THROUGH ANY
            // PATH (session complete, panic valve, override), the "release
            // it later" monitor for this session is stale — leaving it
            // scheduled would just be a harmless no-op later, but cancelling
            // is one call and removes any doubt.
            AppGroupStore.removeShield(store: self.store)
            self.activityCenter.stopMonitoring([expiryActivityName])
        }

        AsyncFunction("isShieldActive") { () -> Bool in
            AppGroupStore.isShieldActive(store: self.store)
        }

        // MARK: - DeviceActivity scheduling (docs/05 §3.5)

        AsyncFunction("scheduleAutoExpiry") { (atEpochMs: Double) -> Void in
            self.scheduleExpiry(atEpochMs: atEpochMs)
        }

        AsyncFunction("cancelScheduledExpiry") { () -> Void in
            self.activityCenter.stopMonitoring([expiryActivityName])
        }

        AsyncFunction("scheduleScheduledArm") { (atEpochMs: Double, selectionId: String) -> Void in
            self.scheduleArm(atEpochMs: atEpochMs, selectionId: selectionId)
        }

        AsyncFunction("cancelScheduledArm") { () -> Void in
            self.activityCenter.stopMonitoring([armActivityName])
            AppGroupStore.setScheduledArmSelectionId(nil)
        }

        // MARK: - Cross-process signals (docs/05 §3.7, §3.8)

        AsyncFunction("consumePendingPanicValveIntent") { () -> Double? in
            AppGroupStore.consumePanicValveIntent()
        }

        AsyncFunction("setSessionDisplayHold") { (hold: String) -> Void in
            AppGroupStore.setSessionHold(hold)
        }
    }

    // MARK: - Authorization mapping

    private static func mapAuthorizationStatus(_ status: AuthorizationStatus) -> String {
        switch status {
        case .approved: return "approved"
        case .denied: return "denied"
        case .notDetermined: return "notDetermined"
        @unknown default: return "notDetermined"
        }
    }

    // MARK: - Picker

    @MainActor
    private func presentActivityPicker(previousSelectionId: String?) async throws -> [String: Any] {
        guard let presenter = Self.topViewController() else {
            // No window to present from. This is the one path in this module
            // that legitimately throws — see the file header.
            AppGroupStore.log("presentActivityPicker: no root view controller to present from")
            throw AmporaIgnitionError.noPresenter
        }

        var seed = FamilyActivitySelection()
        if let previousSelectionId, let previous = AppGroupStore.loadSelection(id: previousSelectionId) {
            seed = previous
        }

        return await withCheckedContinuation { (continuation: CheckedContinuation<[String: Any], Never>) in
            let host = IgnitionPickerHostingController(initialSelection: seed) { selection in
                continuation.resume(returning: Self.pickerResultDict(selection: selection))
            }
            host.modalPresentationStyle = .formSheet
            presenter.present(host, animated: true)
        }
    }

    /// Builds the JS-facing result. There is no reliable, low-risk way from
    /// this side to distinguish "the user tapped Cancel" from "the user
    /// confirmed an empty selection" (both leave the `FamilyActivitySelection`
    /// binding empty when the sheet closes), and the two are behaviorally
    /// equivalent for Ampora anyway — either way there is nothing to shield,
    /// which `core/blocking/NativeBlockingStrategy.ts` and the store both
    /// already treat as "no selection" (`StartStakeRefusal: 'no_selection'`).
    /// So `cancelled` is derived from emptiness rather than from a genuine
    /// Apple-level cancel signal. Worth confirming on a real device once this
    /// compiles — see native/README.md's "what is NOT verified here".
    private static func pickerResultDict(selection: FamilyActivitySelection) -> [String: Any] {
        let isEmpty = selection.applicationTokens.isEmpty
            && selection.categoryTokens.isEmpty
            && selection.webDomainTokens.isEmpty

        guard !isEmpty else {
            return [
                "cancelled": true,
                "selectionId": NSNull(),
                "count": 0,
                "applicationTokens": [String](),
                "categoryTokens": [String](),
                "webDomainTokens": [String](),
                "pickedAt": Date().timeIntervalSince1970 * 1000,
            ]
        }

        let count = selection.applicationTokens.count + selection.categoryTokens.count + selection.webDomainTokens.count
        let id = AppGroupStore.saveSelection(selection)

        return [
            "cancelled": false,
            "selectionId": id ?? NSNull(),
            "count": count,
            // Opaque per-token fingerprints — never the real token bytes, and
            // never anything that identifies an app (docs/05 §1, §3.2). See
            // src/types.ts for exactly what these are for (mismatch
            // diagnostics only; the shield always re-reads the REAL tokens
            // from the App Group by `selectionId`, never from these strings).
            "applicationTokens": Self.opaqueIds(selection.applicationTokens),
            "categoryTokens": Self.opaqueIds(selection.categoryTokens),
            "webDomainTokens": Self.opaqueIds(selection.webDomainTokens),
            "pickedAt": Date().timeIntervalSince1970 * 1000,
        ]
    }

    private static func opaqueIds<T: Encodable>(_ tokens: Set<T>) -> [String] {
        tokens.compactMap { token in
            guard let data = try? PropertyListEncoder().encode(token) else { return nil }
            return data.base64EncodedString()
        }
    }

    /// Walks the key window's presented-view-controller chain to find where a
    /// modal can actually be presented from. Scene-based (iOS 13+ multi-window
    /// safe) rather than the deprecated `UIApplication.shared.keyWindow`.
    private static func topViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let keyWindow = scenes.flatMap(\.windows).first(where: \.isKeyWindow) ?? scenes.first?.windows.first
        var top = keyWindow?.rootViewController
        while let presented = top?.presentedViewController {
            top = presented
        }
        return top
    }

    // MARK: - Shield

    private func applyShield(selectionId: String) -> [String: Any] {
        let status = AuthorizationCenter.shared.authorizationStatus
        guard status == .approved else {
            AppGroupStore.log("applyShield: authorization is \(status), refusing (fail-safe: leaving unlocked)")
            return ["ok": false, "reason": "authorization_not_approved"]
        }

        guard let selection = AppGroupStore.loadSelection(id: selectionId) else {
            // Covers BOTH "no such id" and "decode failed" — the latter is the
            // real-world token-mismatch bug (docs/05 §3.6). Either way: do not
            // apply a partial/garbage shield, report it, and leave unlocked.
            AppGroupStore.log("applyShield: selection \(selectionId) not found or failed to decode")
            return ["ok": false, "reason": "selection_decode_failed"]
        }

        if Self.isSuspiciouslyBroadSelection(selection) {
            // docs/05 §4: an "everything" category would sweep the never-lock
            // categories (phone, messages, maps, ...) in behind it. iOS
            // category tokens are opaque, so unlike `core/blocking/limits.ts`
            // on the soft path there is no literal string to match against —
            // the best a native-only check can do is refuse an implausibly
            // broad category count. The picker UI itself
            // (`components/stakes/AppPicker.tsx`, out of this module's scope)
            // is expected to never offer a literal "everything" toggle in the
            // first place; this is defense in depth, not the primary guard.
            AppGroupStore.log("applyShield: refusing a suspiciously broad category selection (docs/05 §4)")
            return ["ok": false, "reason": "all_apps_category_rejected"]
        }

        AppGroupStore.applyShield(store: store, selection: selection)
        return ["ok": true]
    }

    private static let allCategoriesSuspicionThreshold = 12

    private static func isSuspiciouslyBroadSelection(_ selection: FamilyActivitySelection) -> Bool {
        selection.categoryTokens.count >= allCategoriesSuspicionThreshold
    }

    // MARK: - DeviceActivity scheduling (docs/05 §3.5)

    private func scheduleExpiry(atEpochMs: Double) {
        let endAt = Date(timeIntervalSince1970: atEpochMs / 1000)

        // Belt-and-suspenders (docs/05 §3.5 treats `eventDidReachThreshold` /
        // `intervalDidEnd` as interchangeable release signals, precisely
        // because interval-end callbacks are not the only thing that can be
        // late/early/suppressed): register a companion event, over whichever
        // tokens are CURRENTLY shielded, whose usage threshold approximates
        // the same deadline. This is best-effort by nature (usage-based
        // events can fire prematurely, and Low Power Mode can suppress them
        // entirely) — the schedule's own `intervalDidEnd` above remains the
        // primary native-side release path, and the in-app wall clock stays
        // authoritative over both.
        var events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
        if let activeId = AppGroupStore.activeSelectionId(), let selection = AppGroupStore.loadSelection(id: activeId) {
            let secondsUntilEnd = max(1, Int(endAt.timeIntervalSinceNow))
            events[Self.expiryEventName] = DeviceActivityEvent(
                applications: selection.applicationTokens,
                categories: selection.categoryTokens,
                webDomains: selection.webDomainTokens,
                threshold: DateComponents(second: secondsUntilEnd)
            )
        }

        scheduleOneShot(name: expiryActivityName, endAt: endAt, events: events)
    }

    /// Shared with `DeviceActivityMonitorExtension.swift` by NAME, not by
    /// import (extensions cannot import the main app target) — keep the raw
    /// string in sync with `expiryEventName` there.
    private static let expiryEventName = DeviceActivityEvent.Name("ignition.expiry.event")

    private func scheduleArm(atEpochMs: Double, selectionId: String) {
        AppGroupStore.setScheduledArmSelectionId(selectionId)
        let armAt = Date(timeIntervalSince1970: atEpochMs / 1000)
        // The arm monitor's INTERVAL START is the arm moment — intervalDidStart
        // (in the DeviceActivityMonitor extension) is what applies the shield
        // when the app is closed. The interval needs a valid, later END to be
        // a well-formed schedule; that end time is never itself acted on here
        // (release is owned by the auto-expiry monitor, scheduled separately
        // once the session actually starts), so a generous fixed ceiling is
        // fine.
        let ceiling = armAt.addingTimeInterval(60 * 60 * 12)
        scheduleOneShot(name: armActivityName, startAt: armAt, endAt: ceiling)
    }

    /// The core DeviceActivity trick this whole backstop relies on: a
    /// schedule with `repeats: false` built from FULL date components
    /// (year/month/day, not just hour/minute/second) becomes a one-shot
    /// wall-clock window rather than a daily-recurring time-of-day window, so
    /// `intervalDidStart`/`intervalDidEnd` fire at the exact given moments
    /// even with the app closed (docs/05 §3.5, ARCH_PLAN A4). `startAt`
    /// defaults to "now" for the common "release at X" backstop;
    /// `scheduleArm` overrides it to "arm at X" for the scheduled-trigger case.
    private func scheduleOneShot(
        name: DeviceActivityName,
        startAt: Date = Date(),
        endAt: Date,
        events: [DeviceActivityEvent.Name: DeviceActivityEvent] = [:]
    ) {
        let calendar = Calendar.current
        let comps: Set<Calendar.Component> = [.year, .month, .day, .hour, .minute, .second]
        let safeEnd = endAt > startAt ? endAt : startAt.addingTimeInterval(1)
        let startComponents = calendar.dateComponents(comps, from: startAt)
        let endComponents = calendar.dateComponents(comps, from: safeEnd)

        let schedule = DeviceActivitySchedule(
            intervalStart: startComponents,
            intervalEnd: endComponents,
            repeats: false
        )

        do {
            // Idempotent re-arm: stop any previous schedule under this name
            // first, so "calling scheduleAutoExpiry again REPLACES the
            // previous one" (the BlockingStrategy contract) holds even if
            // `startMonitoring` on an already-active name does not itself
            // cleanly replace it on every iOS version.
            activityCenter.stopMonitoring([name])
            try activityCenter.startMonitoring(name, during: schedule, events: events)
        } catch {
            // Fail-safe: a missing backstop is not a reason to fail the
            // caller. The in-app wall clock is the source of truth; this is
            // only ever a backstop for when the app is closed (docs/05 §3.5).
            AppGroupStore.log("scheduleOneShot(\(name.rawValue)) failed: \(error)")
        }
    }
}

// MARK: - SwiftUI picker hosting
//
// Apple's Screen Time picker (`FamilyActivityPicker` / the
// `.familyActivityPicker` modifier) is SwiftUI-only, so it needs a UIKit host
// to be `present(_:animated:)`-able from the module's imperative,
// Promise-returning call. This is the highest-uncertainty part of this file
// (see native/README.md) — the two-step init (placeholder rootView, then
// patched with a `[weak self]`-capturing one) is a standard workaround for
// not being able to capture `self` before `super.init` completes, but the
// exact SwiftUI/UIHostingController glue should be the first thing checked by
// hand once this compiles.

/// Hosts `IgnitionPickerContent` as a presentable view controller. `onFinish`
/// fires exactly once, after the sheet has fully dismissed.
private final class IgnitionPickerHostingController: UIHostingController<IgnitionPickerContent> {
    private var onFinish: ((FamilyActivitySelection) -> Void)?
    private var finished = false

    init(initialSelection: FamilyActivitySelection, onFinish: @escaping (FamilyActivitySelection) -> Void) {
        self.onFinish = onFinish
        super.init(rootView: IgnitionPickerContent(selection: initialSelection, onFinish: { _ in }))
        rootView = IgnitionPickerContent(selection: initialSelection, onFinish: { [weak self] selection in
            self?.finish(with: selection)
        })
    }

    @available(*, unavailable)
    required init?(coder aDecoder: NSCoder) {
        fatalError("init(coder:) is not supported for IgnitionPickerHostingController")
    }

    private func finish(with selection: FamilyActivitySelection) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { [weak self] in
            self?.onFinish?(selection)
            self?.onFinish = nil
        }
    }
}

/// A clear full-screen SwiftUI host that presents Apple's picker as a sheet
/// via `.familyActivityPicker` and reports the resulting selection once the
/// sheet closes (`isPresented` flipping back to `false` is the only signal
/// this modifier gives; see `pickerResultDict`'s comment for why cancel vs.
/// an empty save are not distinguished here).
struct IgnitionPickerContent: View {
    @State private var selection: FamilyActivitySelection
    @State private var isPresented = true
    private let onFinish: (FamilyActivitySelection) -> Void

    init(selection: FamilyActivitySelection, onFinish: @escaping (FamilyActivitySelection) -> Void) {
        self._selection = State(initialValue: selection)
        self.onFinish = onFinish
    }

    var body: some View {
        Color.clear
            .familyActivityPicker(isPresented: $isPresented, selection: $selection)
            // Single-value `onChange(of:perform:)` rather than the iOS 17+
            // two-parameter form, deliberately: it is available all the way
            // back to this module's iOS 16.0 minimum (AmporaIgnition.podspec)
            // and still works (with a deprecation warning) on newer SDKs.
            .onChange(of: isPresented) { presented in
                guard !presented else { return }
                onFinish(selection)
            }
    }
}
