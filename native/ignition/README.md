# Ampora Ignition — native iOS app-blocking (ISOLATED reference scaffolding)

> **Status: NOT wired into the build.** Everything in `native/ignition/` is
> reference-only scaffolding. It is excluded from `tsconfig.json`
> (`"exclude": ["native/**"]`) and is not imported by any app code. The app
> ships today on the **SoftBlockingStrategy** (an in-app focus lock) with no
> Apple entitlement. This folder is the plan for swapping in **real** OS-level
> app-blocking once the entitlement lands.

Companion spec: `docs/06_Technical_Spec_App_Blocking.md`. Interface:
`core/blocking/BlockingStrategy.ts`. Selector: `core/blocking/index.ts`.
Stub to fill in: `core/blocking/NativeBlockingStrategy.ts`. Flag:
`constants/featureFlags.ts` → `FEATURE_FLAGS.IGNITION_NATIVE`.

---

## Why this is isolated

Real app-blocking on iOS needs Apple's **Family Controls** framework, which
requires the privileged `com.apple.developer.family-controls` entitlement —
granted per bundle ID by Apple, with written justification, and **only via a
paid Apple Developer account** (which we do not have yet). Shipping any static
`import` of a native blocking module would break the web export and any build
without the native side. So:

- The soft lock (in-app) is the **active** strategy and works everywhere.
- The native strategy is a **stub** (`NativeBlockingStrategy.ts`) that refuses
  loudly and is only ever constructed when `IGNITION_NATIVE` is `true`.
- This folder holds the Swift extensions + config-plugin template that make the
  stub real, kept out of the RN/TS build until deliberately enabled.

---

## Enable checklist (do these in order)

1. **Apple Developer account + entitlement.** Enroll in the Apple Developer
   Program. Request the **Family Controls (Distribution)** capability for all
   **four** bundle IDs (main app + the three extensions below), with a
   self-directed-focus-tool justification (see `docs/06` §9). This is the
   long-lead item — request it first. Use **Family Controls (Development)** in
   Xcode to build/test on a device while waiting.

2. **Install a native module.** Pick one:
   - `react-native-device-activity` (kingstinct) — granular DeviceActivity +
     shielding + picker. Recommended for Beat-the-clock scheduling.
   - `expo-app-blocker` — higher-level `setBlockConfiguration` / `temporaryUnlock`
     (maps cleanly to the panic valve).

   ```sh
   npx expo install react-native-device-activity
   # or: npx expo install expo-app-blocker
   ```

3. **Add the config plugin.** Either the module's own plugin or the in-repo
   template `ampora-ignition.plugin.js` (copy it out of `native/ignition/`
   into a build-visible location first — it is excluded from tsconfig here).
   Reference it in `app.json` under `expo.plugins`, and declare the three app
   extensions under `expo.ios` / `extra.eas.build.experimental.ios.appExtensions`
   with the Family Controls + App Group entitlements. See the plugin file's
   header for the exact entries. Four App IDs total, all with Family Controls +
   App Groups, or you get cryptic provisioning errors.

4. **Wire `NativeBlockingStrategy.ts`.** Replace the stub bodies with the real
   impl sketched in that file's header comment: lazy-`import()` the native
   module inside each method (never a top-level import), apply/remove the
   `ManagedSettings` shield, persist the `FamilyActivitySelection` in the App
   Group, and schedule DeviceActivity monitors for Beat-the-clock + auto-expiry.
   Make `isAvailable()` return true only on iOS with the module linked +
   entitlement present.

5. **Build the Swift extensions.** The three `.swift` files here are skeletons
   for the extension targets the config plugin creates:
   - `DeviceActivityMonitor.swift` — `intervalDidStart/End`, `eventDidReachThreshold`.
   - `ShieldConfiguration.swift` — the block-screen content (icon/title/subtitle/buttons).
   - `ShieldAction.swift` — shield button taps → panic-valve intent + "open Ampora" notification.

6. **Flip the flag.** Set `FEATURE_FLAGS.IGNITION_NATIVE = true`. From then on
   `getBlockingStrategy()` returns the native strategy whenever it reports
   available; otherwise it still falls back to the soft lock. No call sites in
   the app change — everything goes through `getBlockingStrategy()`.

7. **Custom dev client + EAS.** Expo Go cannot host Family Controls. Build a
   custom dev client and distribute via EAS. Run the `docs/06` §8 on-device
   test checklist (shield persists across kill/reboot, cap + quiet-hours
   auto-release with the app closed, panic-valve friction, token-mismatch
   graceful re-pick, fail-safe leaves the user unlocked on any error).

---

## Non-negotiables carried over from the soft path

Even with native shielding, ALL wellbeing rules stay in `store/stakesStore.ts`
(the store, not the native side, owns caps, quiet hours, never-lock, the panic
valve, de-escalation, and pause). The native strategy only applies/removes the
shield. **Fail-safe:** any error applying or reading the shield must leave the
user **unlocked** and logged — the product under-locks rather than traps
(NFR-7, `docs/06` §3.10). The panic valve and pause are always available.
