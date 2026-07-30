# Ampora `native/` — the iOS Family Controls module and the isolation contract

> Read `docs/05_App_Blocking_Technical.md` (the shielding spec this implements),
> `docs/04_Ignition_Sessions_and_Verification.md` §6 (the unlock flow it backs),
> and `core/blocking/*.ts` (the seam app code actually calls) before touching
> anything here.

---

## THE PERMANENT INVARIANT (read this twice)

**`native.config.json` is committed with every flag `false` on every shared
branch, always.** Native builds are produced by the `-native` EAS profiles
(`development-native`, `preview-native`, `production-native` in `eas.json`),
which set `AMPORA_NATIVE=1` in the build environment — **never** by committing
a flipped flag file.

This is what guarantees, on a Windows machine that cannot build iOS at all:

- `npx tsc --noEmit` stays at 0 errors (`tsconfig.json` excludes `native/**`).
- `npm run lint` never reports phantom unresolved-import errors (`eslint.config.js` ignores `native/**`).
- `npx expo export --platform web` keeps working (`app.config.ts` returns
  `app.json` unchanged when native is off; Metro aliases every optional native
  package to `core/native/optionalStub.js` and blocks `native/modules/**`
  from its crawler entirely).

If you flip native on locally to test something (`npm run native:on`), **flip
it back (`npm run native:off`) before you commit.** Enforce this in review —
a stray `ignitionNative: true` in a diff is a bug, not a feature.

---

## Layout

```
native/
  README.md                          # this file
  package-additions.json              # npm packages a native build needs (by flag), read by scripts/native-toggle.js
  modules/
    ampora-ignition/                  # the Expo module — see below
core/
  native/optionalStub.js              # what Metro resolves every optional native package to, while off
```

`native/modules/`, not `modules/`. Expo autolinking's default `nativeModulesDir`
is `modules/`, which would link anything placed there the moment anyone ran
`prebuild`, no switch required. Putting the module under `native/modules/`
instead means linkage is one explicit, permanently-committed line in
`package.json`:

```json
"expo": { "autolinking": { "nativeModulesDir": "./native/modules" } }
```

That line is inert on Windows and on web — it only means something once
`expo prebuild` actually runs, which never happens here.

### `native/modules/ampora-ignition/`

The real OS-level app-blocking implementation: Apple FamilyControls (the
picker + authorization), ManagedSettings (the shield itself), and DeviceActivity
(scheduling + the backstop that fires with the app closed). No third-party
RN wrapper package — it is written directly against Apple's frameworks plus
`expo-modules-core`, both already available once the native path is on.

```
ampora-ignition/
  expo-module.config.json   # Expo autolinking descriptor (apple platform, module name AmporaIgnition)
  package.json               # name "ampora-ignition"; main points straight at src/index.ts (no build step)
  plugin/
    index.js                  # entry: composes entitlements + the App Group marker + the extension-target mod
    withExtensionTargets.js    # the xcodeproj mod — creates the 3 app-extension targets (the hard part, see below)
  src/
    index.ts                  # requireOptionalNativeModule('AmporaIgnition') by NAME, memoized
    types.ts                  # the native module's TS surface (kept in sync BY HAND with core/blocking/nativeTypes.ts)
    FamilyActivityPicker.tsx   # JS wrapper: calls the imperative native picker, renders fallback+retry UI on failure
  ios/
    AmporaIgnitionModule.swift # the main Expo module: authorization, shield apply/remove, DeviceActivity scheduling
    AppGroupStore.swift        # shared App Group read/write helpers — the ONE file every target links, so the
                                # on-disk key/format can never drift between the app and the three extensions
    AmporaIgnition.podspec     # CocoaPods spec for the main module target (autolinked)
    extensions/
      DeviceActivityMonitor/
        DeviceActivityMonitorExtension.swift   # intervalDidStart/End, eventDidReachThreshold
        Info.plist
      ShieldConfiguration/
        ShieldConfigurationExtension.swift      # the block-screen content
        Info.plist
      ShieldAction/
        ShieldActionExtension.swift             # shield button taps -> panic-valve intent + "Open Ampora" notification
        Info.plist
```

The three extension targets are **not** CocoaPods targets — they are plain
Xcode app-extension targets that `plugin/withExtensionTargets.js` registers
directly against the `.xcodeproj` at `expo prebuild` time (a "xcodeproj mod"),
because Expo's public config-plugin API has no first-class "add an app
extension target" helper. See that file's header comment for exactly what it
does and where it is most likely to need a hand adjustment on a real Xcode
project.

---

## Enable checklist (do these in order, on a Mac)

1. **Apple Developer account + entitlement.** Request the **Family Controls
   (Distribution)** capability for all **four** bundle IDs (main app +
   `AmporaDeviceActivityMonitor` + `AmporaShieldConfiguration` +
   `AmporaShieldAction`), self-directed-focus-tool justification (docs/05 §9).
   This is the long-lead item — start it first. Use **Family Controls
   (Development)** in Xcode to build/test on a device while waiting.

2. **Flip the flag locally:**
   ```sh
   npm run native:on            # writes native.config.json only
   npm run native:status        # confirm ignitionNative=ON
   ```

3. **Install the packages the toggle prints** (see `native/package-additions.json`
   — today the `ignition` group is empty: nothing third-party to install, the
   module is homegrown against Apple's own frameworks).

4. **Generate the native project** (writes a gitignored `ios/`):
   ```sh
   npx expo prebuild --platform ios --clean
   ```
   Verify: 4 targets exist in `ios/Ampora.xcodeproj` (the app + 3 extensions),
   each with Family Controls + DeviceActivity + ManagedSettings + the
   `group.com.ampora.blocker` App Group entitlement.

5. **Typecheck the native TS tree too** (Windows' `npm run typecheck` never
   sees it; this is the Mac-only companion):
   ```sh
   npm run typecheck:native
   ```

6. **Build through an EAS `-native` profile:**
   ```sh
   eas build --profile development-native --platform ios
   ```

7. **Turn native back off before committing:**
   ```sh
   npm run native:off
   ```

8. Run the on-device checklist in `docs/05_App_Blocking_Technical.md` §8 —
   token-mismatch re-pick, premature-event / Low-Power-Mode behavior, fail-safe
   on every error path, panic valve, daily cap + quiet hours releasing with the
   app closed.

---

## Non-negotiables (docs/05 §3.10, §4, §9.10 — apply no matter which strategy is active)

- **Fail-safe, everywhere:** if applying or reading the shield throws, or
  authorization is uncertain, the result is **unlocked**, logged, never a
  trapped user. Every method on `NativeBlockingStrategy` (`core/blocking/
  NativeBlockingStrategy.ts`) resolves rather than rejects for exactly this
  reason — the Swift side mirrors it: catch, log to the App Group, degrade to
  "unshielded" or "unknown", never propagate a crash into a stuck shield.
- **Wellbeing rules (caps, quiet hours, panic valve, de-escalation, never-lock)
  live in `store/stakesStore.ts`, not here.** This module only applies/removes
  a shield and schedules backstops; it has no opinion about *whether* a lock
  should be active.
- **The shield cannot launch Ampora.** "Open Ampora" on the block screen posts
  a local notification that deep-links back (docs/05 §3.8) — there is no other
  way off a shield screen into the app.
- **Authorization is `.individual`, never `.child`.** Ampora locks the user's
  own device by their own choice; this is not parental control.
- **Never-lock categories are enforced in code**, not only in copy — see
  `core/blocking/limits.ts` (`NEVER_LOCK_CATEGORIES`, `isAllAppsCategory`).

---

## What is NOT verified here

This module was written on Windows and **has never been compiled.** `tsc`
never sees `native/**` (by design — see the invariant above), and there is no
Swift toolchain in this environment. Treat every `.swift` file and the
`withExtensionTargets.js` xcodeproj mod as a careful, doc-grounded first draft
that needs a real Xcode build to confirm — start there before trusting any of
it on a device. See the task report / PR description for the specific list of
lower-confidence spots (the SwiftUI picker-hosting glue and the exact
`xcodeproj`/`xcode` package call shapes in `withExtensionTargets.js` chief
among them).
