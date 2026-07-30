//
//  AppGroupStore.swift
//  Ampora Ignition
//
//  Shared App Group state. EVERY Ignition target links this SAME file --
//  the main module (via AmporaIgnition.podspec's source_files) and all three
//  extensions (copied in by plugin/withExtensionTargets.js at prebuild time,
//  from this one canonical source) -- so the on-disk key/format can never
//  drift between them. Drift here is exactly the kind of bug that produces a
//  stuck shield (docs/05 §3.6, §3.10), which is the one failure mode this
//  whole module exists to avoid.
//
//  FAIL-SAFE RULE FOR EVERY FUNCTION HERE (docs/05 §3.10): never throw, never
//  force-unwrap, never crash on missing/corrupt data. A read that fails
//  returns nil/false/empty (the safe default); a write that fails is a
//  logged no-op. `applyShield`/`removeShield` are the two operations closest
//  to "cannot meaningfully fail" -- ManagedSettings property assignment does
//  not throw -- so they are the one place a caller can treat as unconditional.
//
import Foundation
import FamilyControls
import ManagedSettings

enum AppGroupStore {

    /// Must match `com.apple.security.application-groups` in app.config.ts
    /// (APP_GROUP) and the entitlement every one of the four App IDs carries.
    /// A mismatch here fails SILENT and SAFE: `UserDefaults(suiteName:)`
    /// returns nil rather than throwing, so every read below already treats
    /// "nothing there" as the correct fail-safe default (unlocked).
    static let appGroupId = "group.com.ampora.blocker"

    private static var defaults: UserDefaults? {
        UserDefaults(suiteName: appGroupId)
    }

    // MARK: - Keys

    private enum Key {
        /// + selectionId -> PropertyList-encoded FamilyActivitySelection.
        static let selectionPrefix = "ignition.selection."
        static let activeSelectionId = "ignition.activeSelectionId"
        /// "session" | "until_done" -- which ShieldConfiguration copy to show (docs/05 §3.7).
        static let sessionHold = "ignition.sessionHold"
        static let panicValveRequestedAt = "ignition.panicValveRequestedAt"
        /// Which selection a pending `scheduleScheduledArm` should apply once
        /// `intervalDidStart` fires in the monitor extension (docs/05 §3.5).
        static let scheduledArmSelectionId = "ignition.scheduledArmSelectionId"
        static let lastError = "ignition.lastError"
    }

    // MARK: - Selections (docs/05 §3.2)

    /// Persists a freshly-picked selection under a new id and marks it
    /// active. Returns nil (rather than throwing) if encoding fails, which
    /// the caller treats as "nothing was picked" -- under-lock, never trap.
    @discardableResult
    static func saveSelection(_ selection: FamilyActivitySelection) -> String? {
        let id = UUID().uuidString
        guard let data = try? PropertyListEncoder().encode(selection) else {
            log("saveSelection: PropertyListEncoder failed")
            return nil
        }
        defaults?.set(data, forKey: Key.selectionPrefix + id)
        defaults?.set(id, forKey: Key.activeSelectionId)
        return id
    }

    /// Loads a previously-saved selection. Returns nil on ANY decode failure.
    /// This nil path IS the token-mismatch bug (docs/05 §3.6): an OS upgrade
    /// can change how a token encodes, so a selection saved under one OS
    /// build can fail to decode on the next. The caller (applyShield) reports
    /// `selection_decode_failed` on nil rather than half-applying a shield.
    static func loadSelection(id: String) -> FamilyActivitySelection? {
        guard let data = defaults?.data(forKey: Key.selectionPrefix + id) else { return nil }
        do {
            return try PropertyListDecoder().decode(FamilyActivitySelection.self, from: data)
        } catch {
            log("loadSelection(\(id)): decode failed -- treating as a token mismatch: \(error)")
            return nil
        }
    }

    static func activeSelectionId() -> String? {
        defaults?.string(forKey: Key.activeSelectionId)
    }

    static func clearSelection(id: String) {
        defaults?.removeObject(forKey: Key.selectionPrefix + id)
        if defaults?.string(forKey: Key.activeSelectionId) == id {
            defaults?.removeObject(forKey: Key.activeSelectionId)
        }
    }

    // MARK: - Session display (docs/05 §3.7 -- which shield copy to show)

    static func setSessionHold(_ hold: String) {
        defaults?.set(hold, forKey: Key.sessionHold)
    }

    /// Defaults to "session" -- the default hold (docs/04 §2) -- when never
    /// set, e.g. before the TS side calls `setSessionDisplayHold`. Never nil.
    static func sessionHold() -> String {
        defaults?.string(forKey: Key.sessionHold) ?? "session"
    }

    // MARK: - Panic valve intent (ShieldAction -> app, consumed on next foreground)

    static func writePanicValveIntent() {
        defaults?.set(Date().timeIntervalSince1970 * 1000, forKey: Key.panicValveRequestedAt)
    }

    /// Reads AND clears the pending intent in one call, so a second
    /// foreground can never replay the same panic-valve request.
    static func consumePanicValveIntent() -> Double? {
        guard let value = defaults?.object(forKey: Key.panicValveRequestedAt) as? Double else { return nil }
        defaults?.removeObject(forKey: Key.panicValveRequestedAt)
        return value
    }

    // MARK: - Scheduled arm (docs/05 §3.5 -- the monitor extension's
    // intervalDidStart needs to know WHICH selection to apply when it fires
    // with the app closed; `AmporaIgnitionModule` uses FIXED DeviceActivityName
    // constants for the expiry/arm monitors, so there is nothing to remember
    // for those -- only the selection id varies.)

    static func setScheduledArmSelectionId(_ id: String?) {
        if let id { defaults?.set(id, forKey: Key.scheduledArmSelectionId) }
        else { defaults?.removeObject(forKey: Key.scheduledArmSelectionId) }
    }
    static func scheduledArmSelectionId() -> String? {
        defaults?.string(forKey: Key.scheduledArmSelectionId)
    }

    // MARK: - Shield apply/remove (shared so the module and every extension agree byte-for-byte)

    /// Applies `selection` to `store`. Empty token sets are written as `nil`
    /// rather than an empty `Set`: ManagedSettings treats nil as "no
    /// restriction on this axis", and keeping "nothing shielded" unambiguous
    /// matters because `isShieldActive` and the extensions both read this
    /// same store back.
    static func applyShield(store: ManagedSettingsStore, selection: FamilyActivitySelection) {
        store.shield.applications = selection.applicationTokens.isEmpty ? nil : selection.applicationTokens
        store.shield.applicationCategories = selection.categoryTokens.isEmpty
            ? nil
            : .specific(selection.categoryTokens)
        store.shield.webDomains = selection.webDomainTokens.isEmpty ? nil : selection.webDomainTokens
    }

    /// Unconditional, idempotent (docs/05 §3.4, §3.10). Plain property
    /// assignment to `nil` does not throw, so this is the one operation in
    /// the whole module safe to treat as never failing.
    static func removeShield(store: ManagedSettingsStore) {
        store.shield.applications = nil
        store.shield.applicationCategories = nil
        store.shield.webDomains = nil
    }

    static func isShieldActive(store: ManagedSettingsStore) -> Bool {
        if let apps = store.shield.applications, !apps.isEmpty { return true }
        if store.shield.applicationCategories != nil { return true }
        if let domains = store.shield.webDomains, !domains.isEmpty { return true }
        return false
    }

    // MARK: - Fail-safe logging (docs/05 §3.10 -- log, never throw)

    /// Best-effort diagnostics. `#if DEBUG` print is invisible in a shipped
    /// build; the App Group write means the LAST error survives across the
    /// app/extension process boundary so it can be surfaced in Settings or a
    /// support flow later without needing a device connected to Xcode.
    static func log(_ message: String) {
        #if DEBUG
        print("[AmporaIgnition] \(message)")
        #endif
        defaults?.set("\(Date()): \(message)", forKey: Key.lastError)
    }
}
