# Ampora — Technical Spec: App Blocking (Ignition)

> The implementation reference for the lock-your-own-apps mechanic. Companion to `01_PRD.md` Section 7 (FR-40 to FR-46) and Section 9.9/9.10, and `04_Ignition_Sessions_and_Verification.md` (the session model this enforces). Written so an AI coding agent can build it. Grounded in the current iOS Family Controls / Screen Time frameworks and the real RN/Expo packages that wrap them. No em dashes, no semicolons.
>
> **One-line model:** the user authorizes Ampora to restrict their own device, picks their own leisure apps via Apple's native picker (which returns opaque tokens, not bundle IDs), Ampora shields those apps with ManagedSettings, and a DeviceActivity extension plus shield extensions handle scheduling and the block screen. There is always an escape hatch.

---

## 1. Platform capabilities and the hard constraints (read first)

These are not opinions, they are platform realities that shape the product. Build around them.

**iOS:**
- Three frameworks cooperate: **FamilyControls** (authorization + the app picker), **ManagedSettings** (apply the actual shield), **DeviceActivity** (schedule when the shield is on/off and fire threshold events).
- **You cannot enumerate installed apps or read bundle identifiers on iOS.** The user must select apps through the native `FamilyActivityPicker`, which hands back opaque `ApplicationToken`, `ActivityCategoryToken`, and `WebDomainToken` values. Ampora can shield those tokens but cannot know which app each one is. This is why the stake-apps UI says "the apps you'll put on the line" and shows the picker, not a list Ampora builds.
- **Family Controls is a privileged entitlement.** `com.apple.developer.family-controls` (plus the related managed-settings and device-activity entitlements) must be on the App ID and every extension target. **For TestFlight or App Store distribution you must request and be granted the Family Controls (Distribution) capability from Apple, per bundle ID, with a written justification. It can take days to weeks. You cannot ship without it.** While waiting, use the Family Controls (Development) capability in Xcode (marked Development only) so you can build and test on a device.
- Authorization uses `AuthorizationCenter.shared.requestAuthorization(for: .individual)` for a person restricting their own device (the Ampora case). The other mode, `.child`, is for a parent managing a child device and is not what Ampora uses.
- The block screen ("shield") is customizable only in limited ways: icon, title, subtitle, button labels, and colors. No custom views, fonts, or animations.
- **You cannot launch another app from the shield.** To pull the user back into Ampora, send a local notification they tap. Plan the UX around this.
- Permission status can lag after the user grants or revokes Screen Time access outside the app. Re-check status on every app foreground.
- The picker can crash on very large app categories. Provide a fallback UI with a retry.
- Known iOS bugs to handle: `ApplicationToken` values can sometimes change and stop matching the tokens you stored (compare carefully, store in the App Group, handle mismatch by re-prompting selection). DeviceActivity threshold events can fire prematurely on some iOS versions. Low Power Mode can suppress event reporting.
- There is a brief moment (sub-second) where a shielded app is visible before the shield appears.

**Android:**
- No Apple-style sanctioned API. Use `UsageStatsManager` to detect the foreground app (requires the Usage Access special permission) plus a foreground service plus a full-screen system overlay to interrupt the blocked app (requires the "Display over other apps" permission, granted manually in settings). Detection has roughly a half-second delay (polling), so the blocked app flashes briefly before the overlay.

**Web:** a browser cannot enforce app-blocking. Stakes are unavailable on web (the web app configures stakes; the lock is enforced on the phone). This is the only non-blocking launch platform. Any OS-level desktop enforcement path is out of scope for launch (see `V2_Changes.md`).

---

## 2. Recommended packages and project setup (Expo / React Native)

You do not need to write all the Swift from scratch. Two community packages wrap these frameworks and handle the Expo config plugin, the extension targets, and EAS credential wiring.

- **`expo-app-blocker`** (cross-platform: iOS Screen Time + Android UsageStats/overlay; ships `setBlockConfiguration`, `clearAllBlocks`, `temporaryUnlock`, `relockApps`, `getRemainingUnlockTime`, a `FamilyActivityPickerView`, and pending-unlock listeners). The `temporaryUnlock` API maps cleanly to the panic valve.
- **`react-native-device-activity`** (kingstinct): direct access to Screen Time, DeviceActivity, and shielding, with picker components and scheduling. More granular, good if you need custom DeviceActivity scheduling.

Pick one as the base. `expo-app-blocker` is the faster path to the core session-hold and panic-valve flows. Use `react-native-device-activity` if you need fine DeviceActivity scheduling for the scheduled trigger and its start window.

**Required iOS setup (the package config plugin does most of this, but verify):**
- App ID and all extension App IDs have `com.apple.developer.family-controls`, `com.apple.developer.deviceactivity`, `com.apple.developer.managedsettings`, and an **App Group** (`com.apple.security.application-groups`, for example `group.com.ampora.blocker`).
- Three app extension targets in addition to the main app:
  - **DeviceActivityMonitor** extension (scheduling callbacks: `intervalDidStart`, `intervalDidEnd`, `eventDidReachThreshold`).
  - **ShieldConfiguration** extension (the block screen content).
  - **ShieldAction** extension (handles taps on the shield's buttons).
- In `app.json` (EAS), declare the extensions under `extra.eas.build.experimental.ios.appExtensions` with their bundle IDs and the entitlements above (family-controls + the app group). So 4 App IDs total, all with Family Controls + App Groups, or you get cryptic provisioning errors.
- Use a custom dev client (Expo Go cannot host Family Controls). Build with EAS.

**Operational, do this at project start:** submit the Family Controls (Distribution) approval request for each of the 4 bundle IDs. This is the long-lead item.

---

## 3. iOS data flow (exact)

**3.1 Authorization (once).**
```
on first stakes setup:
  status = getAuthorizationStatus()         // notDetermined | approved | denied
  if status != approved:
     requestAuthorization(.individual)        // shows Apple's Screen Time consent
  re-check status on every app foreground (it can lag)
```
If denied, the stakes UI explains it cannot lock apps without Screen Time permission and offers a deep link to Settings. Never block the rest of the app.

**3.2 Selecting stake apps.**
- Present `FamilyActivityPicker` (or the package's `FamilyActivityPickerView`). The user picks apps/categories/sites.
- Persist the returned `FamilyActivitySelection` (its tokens) in the **App Group** container so the extensions can read it. Also store a stable `familyActivitySelectionId` if using the package's keyed picker.
- Show the count in the UI ("3 apps on the line"), not names (names are not available).
- Wrap the picker in a fallback view with a retry button (it can crash on large categories).

**3.3 Applying a lock (start a staked session).**
```
startStake(session):
  load selection from App Group
  store = ManagedSettingsStore()
  store.shield.applications = selection.applicationTokens
  store.shield.applicationCategories = .specific(selection.categoryTokens)   // if categories chosen
  store.shield.webDomains = selection.webDomainTokens                        // if sites chosen
  write session state (hold, trigger, sessionMin, startedAt, strength) into App Group
  if hold == session:
     schedule a DeviceActivity monitor for the session end at startedAt + sessionMin (see 3.5)
  // hold == until_done: no timed release; the shield holds until verified proof
  //   or until the single-session cap converts it to a release (see 3.5 auto-expiry)
  always schedule the auto-expiry monitor (daily cap, quiet-hours boundary, single-session cap)
  show in-app banner with what is locked and the minutes remaining
  post a "locked" state so the UI reflects it
```

**3.4 Releasing a lock (completion or expiry).**
```
endStake(reason):
  store.shield.applications = nil
  store.shield.applicationCategories = nil
  store.shield.webDomains = nil
  clear session state in App Group
  log outcome (completed | panic_valve | timed_out | expired)
```
Auto-release is triggered by: the session timer completing (hold = session), verified completion (hold = until_done, the app sets it after a passing proof or an override), the task being completed during the session (releases early), the daily lock cap reached, the single-session cap reached, the quiet-hours boundary, or app/device restart recovery (3.6).

**3.5 DeviceActivity for scheduling (scheduled triggers, session end, and auto-expiry).**
- **Session end (hold = session).** Use a `DeviceActivitySchedule` plus a `DeviceActivityEvent` with a threshold to fire `eventDidReachThreshold` / `intervalDidEnd` in the **DeviceActivityMonitor** extension at `startedAt + sessionMin`, so the shield lifts even if the app is closed.
- **Scheduled trigger auto-arm (trigger = scheduled).** At `scheduledAt`, if the user has not started, wait `startWindowMin` (the grace window that absorbs the old beat-the-clock). If still not started at `scheduledAt + startWindowMin`, and it is not quiet hours, call `startStake` to arm the lock for one session length. Completing the task during the window or the lock releases it early. This timing is driven in-app when foregrounded, with a DeviceActivity monitor as the backstop for when the app is closed. A scheduled lock never arms inside quiet hours.
- In the extension's callback, apply or remove the shield via a fresh `ManagedSettingsStore()` (the extension and the app share the store and the App Group).
- Because events can fire prematurely on some iOS versions, also enforce the wall-clock timing in-app as the source of truth, and treat the extension callback as a backstop. Never rely on the extension alone for correctness.
- Always schedule an auto-expiry monitor so a forgotten lock releases at the daily cap, the single-session cap, or the quiet-hours boundary even if the app is closed. For hold = until_done this monitor is what enforces the cap-to-release conversion.

**3.6 Persistence and recovery (kill / restart).**
- The ManagedSettings shield persists across app termination and device restart by design (it is system-enforced), which is what makes the lock real.
- On every app launch and foreground: read session state from the App Group. If a session is active, restore the banner and re-validate against the caps and quiet hours. If the session should have ended (cap or quiet hours passed while the app was closed), release immediately.
- Handle the token-mismatch bug: if the stored tokens no longer match what the extensions receive, release the shield, surface a gentle "re-pick your apps" prompt, and do not leave the user stuck.

**3.7 Shield screen (ShieldConfiguration extension).**
- Configure: app icon, title ("Locked while you focus"), subtitle ("Your apps unlock when this session ends. Open Ampora to keep going."), and button labels. (For hold = until_done the subtitle reads "Your apps unlock when you finish and submit proof in Ampora.") Primary button label "Open Ampora" (note: tapping it cannot launch Ampora directly, so the ShieldAction handler triggers a local notification that deep-links back; see 3.8). Secondary button "Unlock early".
- Colors and blur per the design system. No custom views beyond what the API allows.

**3.8 Shield actions (ShieldAction extension).**
```
handle(action, for app):
  switch action:
    primaryButtonPressed ("Open Ampora"):
       post a local notification that deep-links to the active session
       completionHandler(.defer)        // keep the shield; the notification pulls them back
    secondaryButtonPressed ("Unlock early"):
       start the panic-valve countdown (write intent to App Group); the app handles the 60s friction
       completionHandler(.defer)
```
The panic valve's 60-second friction and de-escalation are handled in the app, not the extension, because the extension cannot show rich UI.

**3.9 Panic valve (exact).**
```
panicValve():
  show "Unlock early" friction screen: 60s countdown + calm copy + "Back to task"
  if user waits out 60s or confirms:
     endStake(panic_valve)
  record panicEvent
  if panicEvents in last window >= 2:
     lower stake strength one notch
     show de-escalation sheet: "Want to pause stakes for today?"  -> Pause stakes | Keep going
```

**3.10 Fail-safe (NFR-7).** If applying or reading the shield throws, or authorization is uncertain, default to unlocked and log. Never leave a user locked due to an error. The product would rather under-lock than trap someone.

---

## 4. Wellbeing caps enforcement (shared logic)

Enforced both in-app and reflected in scheduling of auto-expiry monitors.

```
canStartStake():
  if minutesLockedToday >= dailyLockCapMin: return false   // default 180
  if now within quietHours: return false                   // default 23:00-08:00
  return true

onLockTick():
  if minutesLockedToday >= dailyLockCapMin: endStake(expired)
  if crossedQuietHoursBoundary(): endStake(quiet_hours_release)

neverLock = [phone, messages, maps, accessibility, OS settings, Ampora]
  // enforced by never adding these tokens; on iOS, by guiding the picker and validating selection
```
On iOS, since selection is opaque, enforce never-lock by (a) instructing users in the picker copy and (b) if a category like "all apps" is chosen, refuse and ask them to pick specific leisure apps, so system-critical apps are not caught.

---

## 5. Android implementation (P2)

```
setup:
  request Usage Access (UsageStatsManager) and "Display over other apps" overlay permission
  user picks stake apps from the installed-app list (Android allows enumeration)

lock loop (foreground service):
  poll UsageStatsManager every ~500ms for the foreground package
  if foreground package in stakeApps and session active and not unlocked:
     show full-screen overlay (the Ampora "locked" screen) over the app
  on completion/expiry: dismiss overlay, stop enforcing

panic valve / caps / quiet hours: same logic as iOS, enforced by the service
```
Document the ~500ms flash and the manual overlay-permission grant in onboarding.

---

## 6. Desktop enforcement (deferred)

Out of scope for launch. See `V2_Changes.md`. The `BlockingStrategy` interface (Section 7) is designed so a desktop path can slot in later without touching shared logic.

---

## 7. BlockingStrategy interface (keep platforms decoupled)

Put all of the above behind one interface so core logic never touches platform APIs directly.

```ts
interface BlockingStrategy {
  getPermissionStatus(): Promise<'granted'|'denied'|'undetermined'>;
  requestPermission(): Promise<void>;
  pickStakeApps(): Promise<StakeSelection>;        // opaque on iOS, package names on Android
  applyShield(selection: StakeSelection): Promise<void>;
  removeShield(): Promise<void>;
  isShieldActive(): Promise<boolean>;
  scheduleAutoExpiry(at: number): Promise<void>;   // caps + quiet hours backstop
}
// implementations: IOSFamilyControlsStrategy, AndroidOverlayStrategy, DesktopHostsStrategy
```
The Ignition session logic, caps, panic valve, and de-escalation live in shared code and call this interface. New platforms slot in without rewrites.

---

## 8. Test checklist (on-device, the things that actually break)

- [ ] Entitlement: Development capability builds and runs; Distribution request submitted for all 4 bundle IDs.
- [ ] Authorization `.individual` succeeds; status re-checks correctly on foreground after revoking in Settings.
- [ ] Picker selection persists in the App Group and survives app restart.
- [ ] Shield applies and the app is actually blocked; shield persists across app kill and device reboot.
- [ ] Session timer completes and auto-unlocks within a second (hold = session); the until_done photo path unlocks on a passing proof or an override.
- [ ] Scheduled trigger auto-arms after the start window if not started, and never arms in quiet hours; completing the task releases early.
- [ ] Daily cap and quiet-hours boundary auto-release even with the app closed.
- [ ] Panic valve 60s friction works; repeated use triggers de-escalation and lowers strength.
- [ ] Token-mismatch path: corrupt/changed tokens lead to a graceful re-pick, never a stuck lock.
- [ ] Premature-event and Low-Power-Mode behavior verified; in-app wall-clock timing is the source of truth.
- [ ] Fail-safe: any error leaves the user unlocked, logged.
- [ ] Never-lock: system-critical apps cannot be caught (picker copy + reject all-apps category).

---

## 9. Operational reminders

- Apply for the Family Controls (Distribution) entitlement for all 4 bundle IDs at the very start of the project. This is the single longest-lead dependency and it gates launch.
- Do not gate the whole app launch on stakes. The scheduler ships value on its own, so stakes can go live the moment the entitlement clears.
- Mirror how Opal and Brick describe themselves to Apple (self-directed focus tool, user controls their own device) in the entitlement justification and the App Store listing.
