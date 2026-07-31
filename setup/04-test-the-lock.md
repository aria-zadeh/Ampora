# Testing the real app lock on a phone

This is what actually proves Ampora can lock apps for real, not just in code. Read the warning below before doing anything else, it will save a wasted afternoon.

## Read this first

**Family Controls does not work in the iOS Simulator.** It needs real Screen Time data and real system permission that only exist on an actual iPhone. A real, physical iPhone is required for every step below.

**Expo Go cannot host this either.** Expo Go is a generic, pre-built container app, it does not have Ampora's custom native code compiled into it. A **custom dev client** is required instead, a version of Expo Go with Ampora's own native module baked in. Building that custom dev client is most of what this file does.

If only one thing from this file gets remembered: neither of these can be shortcut. No simulator, no Expo Go, a real iPhone and a real custom build every time.

## What EAS is

EAS (Expo Application Services) is Expo's cloud build service. It compiles the iOS app on Apple's own toolchain in the cloud and hands back an installable app, without needing to fight Xcode's build system directly on the Mac.

## Whose Apple account is needed, and when

Covered in more depth in `01-apple.md` Part 3, restated here at the exact point it matters:

- The very first time `eas build` runs against this project, it asks for sign-in with an Apple ID so it can manage code-signing certificates and provisioning profiles automatically. That Apple ID needs to be on the Ampora developer team with a role that can manage certificates (**Admin** is simplest).
- If the parent has already added the teen as an Admin on the team (`01-apple.md` Part 3), the teen signs into their **own** Apple ID here and everything below runs solo, no parent needed for any individual command.
- If that has not happened yet, either the parent runs this step personally (signing in with their own Apple ID when asked), or the teen gets added to the team first. Adding the teen first is the better long-term move, it only needs doing once.
- Let EAS generate and manage certificates and provisioning profiles automatically when it asks. Doing this by hand in Xcode instead is more error-prone.

## The exact commands, in order

Run these from the repo root, on the Mac, inside the cloned Ampora repo (`03-mac-setup.md`).

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
**Should show:** the family-controls, deviceactivity, managedsettings, and application-groups entitlements listed. If this shows nothing, or the file does not exist, stop here, something in `app.config.ts` or the plugin did not run correctly.

```
xcodebuild -list -project ios/Ampora.xcodeproj
```
**Should show:** four targets, the main app plus `AmporaDeviceActivityMonitor`, `AmporaShieldConfiguration`, and `AmporaShieldAction`. Fewer than four means the same underlying problem, stop here too.

If either check fails, do not run the EAS build yet, go back and figure out why first (`native/README.md` and `docs/05_App_Blocking_Technical.md` §2 describe what should exist).

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

**8. Install it on the actual phone:**
```
eas build:run -p ios --latest
```
Needs the iPhone connected to the Mac (cable, or sometimes just the same network depending on the EAS CLI version) and unlocked. **What success looks like:** the Ampora icon appears on the phone's home screen and opens.

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
- [ ] **9. A corrupted app selection does not trap anyone.** Hard to trigger by hand, this one needs an engineer (or Claude Code directly) to simulate the app's stored picks getting out of sync with what iOS actually has. **Pass:** the result is a gentle "pick your apps again" prompt, never a lock with no way out.
- [ ] **10. Odd timing does not break anything.** Turn on Low Power Mode and repeat a couple of the tests above. **Pass:** the countdown shown in Ampora is what actually governs when the unlock happens, not whatever the background system reports.
- [ ] **11. Errors fail open, never fail locked.** Also hard to trigger by hand, ask Claude Code to force an error in the shield-apply code path for this one specifically. **Pass:** the result is unlocked and it gets logged somewhere, never stuck behind a lock screen because of an internal error.
- [ ] **12. Protected apps can never be picked.** In the app picker, try to select "All Apps" as a category, or look specifically for Phone, Messages, Maps, Settings, or Ampora itself. **Pass:** an all-apps selection gets refused, and none of those specific ones are ever selectable.

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
