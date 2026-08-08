# Testing the real app lock on a phone

This is what actually proves Ampora can lock apps for real, not just in code. Read the warning below before doing anything else, it will save a wasted afternoon.

## Read this first

**Family Controls does not work in the iOS Simulator.** It needs real Screen Time data and real system permission that only exist on an actual iPhone. A real, physical iPhone is required for every step below.

**Expo Go cannot host this either.** Expo Go is a generic, pre-built container app, it does not have Ampora's custom native code compiled into it. A **custom dev client** is required instead, a version of Expo Go with Ampora's own native module baked in. Building that custom dev client is most of what this file does.

If only one thing from this file gets remembered: neither of these can be shortcut. No simulator, no Expo Go, a real iPhone and a real custom build every time.

## What EAS is

EAS (Expo Application Services) is Expo's cloud build service. It compiles the iOS app on Apple's own toolchain in the cloud and hands back an installable app, without needing to fight Xcode's build system directly on the Mac.

## Whose Apple account is needed, and when

**Read `00-my-situation.md` first if you have not.** The short version: the parent holds the paid Apple Developer membership, and **there is no way to test the app lock without it.** Family Controls is not available on Apple's free Personal Team at all, so this is the one part of Ampora that genuinely cannot be done solo.

**Both prerequisites were satisfied on 2026-08-07. Neither is pending.** Kept here so the reasoning stays visible:

1. **The four App IDs registered, with Family Controls and the App Group enabled.** Done, all four, each verified by page reload, and Family Controls (Distribution) reads `Assigned` on every one. Full record in `01b-apple-session-log.md`.
2. **Apple authentication that can reach the paid team.** Done, via an App Store Connect **Team Key**, so nobody signs in. Export these three in the shell you build from and EAS never prompts for an Apple ID:

```
EXPO_ASC_API_KEY_PATH=C:\Users\Aria\AppleKeys\AuthKey_NQ9F796882.p8
EXPO_ASC_KEY_ID=NQ9F796882
EXPO_ASC_ISSUER_ID=72621750-6b7d-4a97-88a6-aaefa9b2b3ae
```

Note this is Apple auth, not `eas login` — `eas login` uses a free Expo account and involves nobody.

**The parent is no longer needed for anything here.**

**A third prerequisite this file never mentioned: register the iPhone before building.** Run `npx eas-cli@latest device:create`, pick the **Website** option, then open the URL or QR **on the phone** and install the profile it offers. Skip this and the build completes normally and then silently refuses to install.

Covered in more depth in `01-apple.md` Part 3, restated here at the exact point it matters:

- The very first time `eas build` runs against this project, it asks for sign-in with an Apple ID so it can manage code-signing certificates and provisioning profiles automatically. That Apple ID needs to be on the Ampora developer team with a role that can manage certificates (**Admin** is simplest).
- **The teen cannot be added to the team.** An earlier version of this file said they could, as an Admin. That is impossible on an **individual** membership, which is the one in play: Certificates, Identifiers & Profiles is Account-Holder-only there, and anyone an individual member invites reaches App Store Connect only. It is not an age restriction, and it changes only after the LLC-driven Organization conversion. See `01-apple.md` Part 3.
- **So the parent either sits in on the signing step, or hands over an App Store Connect Team Key.** With the key exported as `EXPO_ASC_API_KEY_PATH` / `EXPO_ASC_KEY_ID` / `EXPO_ASC_ISSUER_ID`, EAS creates certificates, creates provisioning profiles and registers devices with no Apple ID prompt at all, and everything below runs solo from then on. Without it, he is needed again on every certificate expiry and every new test device.
- Let EAS generate and manage certificates and provisioning profiles automatically when it asks. Doing this by hand in Xcode instead is more error-prone.

## The exact commands, in order

Run these from the repo root, inside the cloned Ampora repo.

**A Mac is not required to get the app onto the phone.** `eas build` compiles on Expo's cloud macOS machines, and `development-native` is `distribution: internal`, so the finished build installs from a link opened in Safari **on the iPhone**. Steps 1 to 5b and step 8 below are Mac-only, and every one of them is an optimisation or an alternative rather than a requirement. The minimum path from Windows is: `eas login`, `eas init`, `eas device:create`, export the three `EXPO_ASC_*` variables above, `eas build --profile development-native --platform ios`, then open the resulting link on the phone.

**No local flag flipping is needed for a cloud build.** Leave `native.config.json` all-false. The `-native` profiles set `AMPORA_NATIVE=1` in the cloud environment, which `constants/nativeFlags.js` reads ahead of the file. Step 1 only matters when building or running locally.

**1. Turn the quarantined native code on, locally:**
```
npm run native:on
```
This edits exactly one file, `native.config.json`, flipping both the app-lock and the subscriptions flags on. **What success looks like:** the terminal prints "Native is ON" with both flags showing ON.

**2. Install the native packages it asks for.**

The command above prints a short list of `npx expo install ...` lines to run. **For the app lock specifically, that list is empty, and that is correct, not a bug or a failure.** The app-lock module is built from scratch directly against Apple's own frameworks, not a third-party wrapper package, so there is nothing to install for it.

A line for `react-native-purchases` will likely print too, since the command above turns on both flags at once. That package belongs to `05-revenuecat.md`, not this file. Skip installing it here unless doing both passes in the same sitting. To turn on only the app-lock flag and get a clean, empty install list, run `npm run native:on -- ignition` instead of the plain version above.

**3. Typecheck the native code:**
```
npm run typecheck:native
```
This checks the TypeScript side of the bridge to the Swift code, using a different config than the normal `npm run typecheck` (which deliberately skips this code on Windows). **What success looks like:** it reports 0 errors, same as the normal typecheck. This step alone does not strictly need a Mac, but since a Mac is already in use at this point, run it now.

**4. Generate the real Xcode project:**
```
npx expo prebuild --clean --platform ios
```
This writes a new `ios/` folder from `app.config.ts` and the app-lock plugin. `ios/` is gitignored and gets thrown away and regenerated like this every time, it is never hand-edited or committed. **What success looks like:** the command finishes without red error text, and a new `ios/` folder exists afterward.

**5. Two quick checks before spending a slow cloud build on it.**

These take seconds and catch a broken setup before waiting 10-20 minutes for an EAS build to fail on it instead. Run both from the repo root:

```
grep -A3 family-controls ios/Ampora/Ampora.entitlements
```
**Should show:** the `com.apple.developer.family-controls` and `com.apple.security.application-groups` entitlements, and **only** those two. If this shows nothing, or the file does not exist, stop here, something in `app.config.ts` or the plugin did not run correctly.

Family Controls is the only entitlement the Screen Time API has, covering all three frameworks. If `com.apple.developer.deviceactivity` or `com.apple.developer.managedsettings` ever reappear here, something re-added two keys that do not exist and the next signed build will fail on them (an unsigned Simulator build will not).

```
xcodebuild -list -project ios/Ampora.xcodeproj
```
**Should show:** four targets, the main app plus `AmporaDeviceActivityMonitor`, `AmporaShieldConfiguration`, and `AmporaShieldAction`. Fewer than four means the same underlying problem, stop here too.

If either check fails, do not run the EAS build yet, go back and figure out why first (`native/README.md` and `docs/05_App_Blocking_Technical.md` §2 describe what should exist).

**5b. Compile the Swift locally first. This is worth more than both checks above.**

An earlier version of this file said the EAS build in step 7 is "the step that actually compiles all the Swift code for the first time anywhere." That is not true — the Swift can be compiled on the Mac, unsigned, for the Simulator, needing **no Apple account and no EAS quota**:

```
xcodebuild -workspace ios/Ampora.xcworkspace -scheme Ampora \
  -configuration Debug -sdk iphonesimulator \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  CODE_SIGNING_ALLOWED=NO build
```

**Should show:** `** BUILD SUCCEEDED **`. Takes a few minutes against 10-20 for a cloud build, and every Swift compile error EAS would report shows up here instead.

Requires the iOS platform SDK, which Xcode does not bundle: `sudo xcodebuild -downloadPlatform iOS` (~8.5GB, one time).

Run this before every `eas build`. On 2026-08-01 its first ever run caught two real bugs that would each have failed a cloud build: the config plugin silently dropping `SWIFT_VERSION` (and three other settings) on all three extension targets, and a wrong argument label on `eventDidReachThreshold` in `DeviceActivityMonitorExtension.swift`. Both are fixed; the point is that this check is where such things surface cheaply.

It only proves the code *compiles*. The lock cannot be *tested* here — Family Controls needs a real device, as the top of this file says.

**6. Sign into EAS:**
```
eas login
```
Uses an Expo account (separate from the Apple account), free to create if one does not exist yet.

**7. Build it in the cloud:**
```
eas build --profile development-native --platform ios
```
This `-native` profile is different from the plain `development` profile in `eas.json`: it additionally sets `AMPORA_NATIVE=1` in the cloud build environment, the cloud equivalent of step 1's `npm run native:on` run locally. This is also the step that actually compiles all the Swift code for the first time anywhere, nothing in this repo has been through a real Swift compiler before this build. **What success looks like:** EAS prints a URL to watch progress at expo.dev, and after roughly 10-20 minutes, "Build finished" with a link to the installable build. This is also the point where EAS may ask for the Apple ID sign-in mentioned above, and will offer to generate certificates and provisioning profiles automatically, agree to that.

**What the most likely failure looks like:** a provisioning error mentioning a missing App ID or a missing capability. This nearly always means one of the four bundle IDs (`01-apple.md`) is missing the Family Controls or App Group entitlement. Check all four, not just the main app.

**8. Install it on the actual phone.**

**From Windows, or from anywhere:** the build output includes a URL and QR code. Open that link **on the iPhone** in Safari and tap Install. Because `development-native` is `distribution: internal`, this is an ad hoc build that installs over the air, no cable and no Mac. This is the normal path now.

**From a Mac with the phone plugged in**, this also works:
```
eas build:run -p ios --latest
```
Needs the iPhone connected (cable, or sometimes just the same network depending on the EAS CLI version) and unlocked.

**What success looks like either way:** the Ampora icon appears on the phone's home screen and opens.

The very first time a build like this runs on the phone, iOS may show an "Untrusted Developer" warning and refuse to open the app. **Fix:** on the iPhone, Settings, General, VPN & Device Management, find the developer profile listed there, tap **Trust**.

**9. Start the dev server and connect:**
```
npx expo start --dev-client
```
Open the Ampora app on the phone, it should connect to the running Metro server automatically. If not, scan the QR code the terminal prints, or type the URL it shows directly into the dev client's connect screen.

**Reminder:** step 2's empty install list for Ignition is expected, not an error. `native/package-additions.json`'s `ignition` group lists zero dependencies by design.

**A separate, smaller native package worth knowing about:** "Sign in with Apple" needs its own native package, `expo-apple-authentication`, which is not part of the app-lock/purchases toggle above at all, it is a normal Expo native package like any other. If it is not installed, the Apple sign-in button just quietly does not appear rather than crashing, so this is easy to miss. To test Apple sign-in on this same build, run `npx expo install expo-apple-authentication` before step 4 above.

## Now, on the phone: the actual test checklist

Each item below is a real way this kind of feature breaks. Go through them in order. Each one says what "it worked" looks like. Do not mark anything passed based on assumption, actually do each one on the phone.

- [ ] **1. Screen Time permission.** Get to the point in the app where it asks for Screen Time access, allow it. Then go to iPhone Settings, Screen Time, and turn Ampora's access off by hand. Come back to Ampora (or just bring it back to the foreground). **Pass:** it notices the permission is gone and asks again, rather than silently breaking or crashing.
- [ ] **2. Picking apps to lock.** Open the app picker inside a stake setup, choose a couple of apps or categories. Fully close Ampora (swipe it away from the app switcher), reopen it. **Pass:** the picks are still there, and the app shows a count like "3 apps on the line," never the actual names of the apps (iOS never tells Ampora which apps were picked, only Apple's own picker knows).
- [ ] **3. The lock actually locks something.** Start a real focus session with a stake. Try to open one of the apps that were picked. **Pass:** Ampora's lock screen appears instead of the app. Then force-quit Ampora itself, and separately, restart the phone entirely. **Pass:** the lock screen is still there blocking the app both times. This is the whole point of the feature, if this does not hold, nothing else matters yet.
- [ ] **4. A timed session ends on its own.** Start a normal (session-hold) lock, let its timer run out. **Pass:** the lock lifts within about a second, with no action needed.
- [ ] **5. The "until done" hold unlocks two separate ways.** Start an until-done lock. **Pass (a):** submitting a photo as proof unlocks it. Start another one. **Pass (b):** the "unlock anyway" override also unlocks it.
- [ ] **6. A scheduled lock arms itself.** Set up a stake with a scheduled start window ("lock in 10 minutes if not started"). Do not start the task. **Pass:** the lock arms on its own once the window passes, and never arms at all if the window falls inside quiet hours (default 11pm-8am). Try again but actually start or finish the task inside the window this time. **Pass:** it releases early instead of arming.
- [ ] **7. Daily and quiet-hours limits release on their own, app closed or not.** Harder to test in one sitting since it needs hitting the 180-minute daily total or crossing the quiet-hours boundary for real. Easiest way: temporarily lower the daily cap in Settings to something small like 15 minutes, hit it, confirm the lock releases even with Ampora fully closed. Set the cap back afterward.
- [ ] **8. The panic valve works, and is not punishing.** Mid-lock, tap the "unlock early" option. **Pass:** there is a genuine 60-second wait with calm, non-shaming text, not an instant unlock. Do this a second time shortly after. **Pass:** the app offers to pause stakes for the rest of the day, rather than adding more pressure or warnings.
- [x] **9. A corrupted app selection does not trap anyone.** Hard to trigger by hand, this one needs an engineer (or Claude Code directly) to simulate the app's stored picks getting out of sync with what iOS actually has. **Pass:** the result is a gentle "pick your apps again" prompt, never a lock with no way out.
  - **Half done, and the important half is the one that works.** Covered in `core/__tests__/nativeBlockingStrategy.test.ts`: a missing `selectionId` never reaches native at all, and native reporting `selection_not_found` / `selection_decode_failed` both resolve **unlocked**, never throwing. Nobody gets trapped.
  - **The "gentle re-pick" prompt does not exist yet.** `NativeBlockingStrategy.getLastApplyShieldOutcome()` is read by nothing outside those tests; `store/stakesStore.ts` only branches on reject-vs-resolve, never on the refusal `reason`, so a stale selection is silently indistinguishable from success. The `no_selection` copy in `StakeSetupSheet.tsx` covers an *empty* selection, not a stale one. Building it means `stakesStore.ts` inspecting the reason and new UI copy alongside `no_selection`. Same gap `docs/05_App_Blocking_Technical.md:222` already tracks.
- [ ] **10. Odd timing does not break anything.** Turn on Low Power Mode and repeat a couple of the tests above. **Pass:** the countdown shown in Ampora is what actually governs when the unlock happens, not whatever the background system reports.
- [x] **11. Errors fail open, never fail locked.** Also hard to trigger by hand, ask Claude Code to force an error in the shield-apply code path for this one specifically. **Pass:** the result is unlocked and it gets logged somewhere, never stuck behind a lock screen because of an internal error.
  - **Done, in the TypeScript layer.** Covered in `core/__tests__/nativeBlockingStrategy.test.ts`: `applyShield` catches both async and sync throws from the native call, records `unknown_error`, and *resolves* rather than rejecting. A second independent layer in `store/stakesStore.ts` (`startStake`, `reconcileActiveSession`) also `.catch()`es and calls `endActive('expired')` to unlock. The tests include a healthy-apply control case, so the fail-open assertions cannot pass vacuously.
  - Still worth confirming on the phone that the Swift side behaves the same, since only the TS layer is reachable from the test harness.
- [ ] **12. Protected apps can never be picked.** In the app picker, try to select "All Apps" as a category, or look specifically for Phone, Messages, Maps, Settings, or Ampora itself. **Pass:** an all-apps selection gets refused, and none of those specific ones are ever selectable.

## While the phone is in hand: four typography spots to eyeball

The app switched typeface from Inter to Lexend. Lexend is a wider face, so text that used to fit on one line may now wrap. Nothing can confirm this from a Windows machine, so check these four while a real device is in front of you. None of them is a crash, they are all "does this look broken".

1. **A long task title on a task card.** `components/ui/TaskCard.tsx` allows two lines. A title that used to fit on one may now take two and push the card taller.
2. ~~**The dense week column on the calendar.**~~ **Already fixed in code — no longer the risky one.** This used to hard-slice the title to six characters, which is what made it the most exposed of the four. `components/calendar/CalendarBlock.tsx:153-169` now uses `numberOfLines={1}` + `ellipsizeMode="tail"`, so the layout measures the real width at any typeface instead of assuming a character advance. Worth a glance in Week view that the ellipsis renders cleanly, but there is no fixed character budget left to overflow.
3. **The lock banner**, the "Instagram and 2 more are locked, 12 min left" line. It is one continuous sentence, so it either fits or wraps awkwardly.
4. **The stake setup sheet**, where the option descriptions are the longest copy in the app. **This is now the one actually worth looking at.** `components/stakes/StakeSetupSheet.tsx:713` was already bumped to `numberOfLines={3}` for Lexend, but the comment above it says the longest blurb fills the space "with nothing spare" even after that fix. Check the "When this session ends" copy at the largest Dynamic Type setting, watching for a tail-ellipsis cutoff at the 3-line cap.

   Spots 1 and 3 (`TaskCard.tsx:206`, `LockBanner.tsx:149`) were checked statically and are low risk: both live in flexible containers with no height cap, so wider text just reflows and the card grows. A glance is enough.

Also worth a look, and a judgement call rather than a bug: the smallest text in the app is 13px captions and 11px micro-labels, both at regular weight. The colour contrast is unchanged and still passes, but Lexend's letterforms at that size are a different reading experience from Inter's. If they feel thin on a real screen, the fix is bumping those two steps to medium weight, not changing the colour.

Where that edit goes, if it turns out to be wanted: `utils/design-tokens.ts:197` (`caption`, 13px) and `:199-200` (`overline` / `tiny`, 11px), mirrored in `tailwind.config.js:78-80`. Both sides must move together — `core/__tests__/design-tokens.test.ts` asserts the token block and Tailwind's `fontSize` block stay key-for-key identical, so changing one alone fails the suite. Swap `fontFamilies.regular` for `fontFamilies.medium`, not just the weight value.

## When done for the session

**Do this before committing anything, or the Windows machine breaks for everyone.** `native.config.json` must be all-false on every branch anyone else touches. If this step gets skipped and a flipped copy ends up committed, the Windows machine's typecheck and web build both break until someone notices and fixes it.

1. ```
   npm run native:off
   ```
2. ```
   npm run typecheck && npx expo export --platform web
   ```
   Both must still come back clean.
3. Commit only `native.config.json`, `package.json`, and `package-lock.json`, plus any genuine code fixes made along the way. **Never commit the `ios/` folder**, it is gitignored and gets thrown away and regenerated every time anyway.

**Two silent edits `expo prebuild` makes that must be reverted, not committed:**

- `package.json` — rewrites the `ios` and `android` scripts from `expo start --ios/--android` to `expo run:ios/run:android`.
- `app.json` — writes `"bundleIdentifier": "com.anonymous.Ampora"` into `ios`, and reformats some arrays.

That bundle ID is Expo's placeholder, produced because `app.json` deliberately carries no `ios.bundleIdentifier` (`app.config.ts` adds the real `com.ampora.app` only on the native path — see its header comment). Committing it would hardcode the placeholder into the Windows/web config, which is exactly the failure mode the flag file exists to prevent. Always `git diff package.json app.json` after a prebuild and `git checkout --` both unless the change is genuinely wanted.

The safest habit is to wrap any local native work in a script with an `EXIT` trap that runs `npm run native:off` and reverts those two files, so a build that fails partway cannot leave the repo in a state that breaks Windows.
