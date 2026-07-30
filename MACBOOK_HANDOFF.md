# MacBook handoff

Three prompts to paste into Claude Code on the MacBook. The first sets the
machine up once. The second runs the native iOS test pass, and can be re-run
any time. The third runs the RevenueCat subscription test pass, and can be
combined with the second or run on its own.

Everything native in this repo is written but quarantined: `native.config.json`
ships all-false on every shared branch, so Windows keeps a clean `tsc` and a
working web export no matter how much Swift exists. Real native builds ship
through the `-native` EAS profiles in `eas.json` (`development-native` and
friends), never by committing a flipped flag. Prompt 2 (and Prompt 3) flip it
on locally, and flip it back off before anything gets committed.

---

## Before you start: one manual copy

Three things cannot be reconstructed from config and have to come across from the
Windows machine. Zip these and put them on iCloud/Drive/a USB stick:

```
C:\Users\Aria\.claude\skills\      →  ~/.claude/skills/
C:\Users\Aria\.claude\agents\      →  ~/.claude/agents/
C:\Users\Aria\.claude\CLAUDE.md    →  ~/.claude/CLAUDE.md
```

The skills directory holds design and Expo skill packs whose original install
sources are not recorded anywhere, so a fresh install cannot fetch them. The
agents directory holds 17 custom subagent definitions. Neither contains secrets.

Everything else — plugins, marketplaces, MCP servers — prompt 1 installs.

**Do not copy `~/.claude.json` across.** It stores API keys in plaintext (there
is a live Obsidian key and a revoked GitHub PAT in the Windows one). Prompt 1
asks you for any key it needs instead. Rotate that Obsidian key while you are
thinking about it.

---

# Prompt 1 — machine setup

> Paste this into Claude Code on the MacBook, in any directory.

```
Set this Mac up as a second development machine for the Ampora project. I work
primarily on a Windows desktop and I want this machine to have the same Claude
Code environment, plus the native iOS toolchain that Windows cannot run.

Work through these steps in order. Tell me what succeeded and what failed at the
end. Do not ask me to confirm each step, just do them and report.

## 1. Prerequisites

Check what is already installed and install only what is missing, using Homebrew
where possible:
- Xcode from the App Store, plus `xcode-select --install` for the command line
  tools. Verify with `xcodebuild -version`. This is a large download; if Xcode
  is absent, tell me and stop rather than waiting on it.
- CocoaPods (`brew install cocoapods`)
- Node 20 or newer (`brew install node`), and confirm `npm -v`
- Watchman (`brew install watchman`)
- The EAS CLI (`npm i -g eas-cli`)
- Git, and confirm `git --version`

## 2. Claude Code marketplaces and plugins

Add these plugin marketplaces:
- anthropics/claude-plugins-official
- obra/superpowers-marketplace
- vercel/vercel-plugin
- JuliusBrussee/caveman
- morphllm/morph-claude-code-plugin
- nextlevelbuilder/ui-ux-pro-max-skill
- VoltAgent/awesome-claude-code-subagents

Then install these plugins:
- frontend-design, vercel, remember, claude-md-management and claude-code-setup
  from claude-plugins-official
- superpowers and superpowers-lab from superpowers-marketplace
- caveman from the caveman marketplace
- morph-compact from the morph marketplace

Enable frontend-design, vercel, caveman and morph-compact.

## 3. MCP servers

Add these at user scope:
- context7, HTTP, https://mcp.context7.com/mcp
- expo, HTTP, https://mcp.expo.dev/mcp
- supabase, HTTP, https://mcp.supabase.com/mcp?project_ref=pgqbwhksxqgnfdkmwlop
- playwright, stdio, npx -y @playwright/mcp@latest
- memory, stdio, npx -y @modelcontextprotocol/server-memory
- sequential-thinking, stdio, npx -y @modelcontextprotocol/server-sequential-thinking

Skip the GitHub and Obsidian servers for now. Both need credentials I have not
given you, and I will add them myself. Do not invent placeholder tokens, and do
not ask me to paste a token into the chat.

The supabase and expo servers use OAuth. Tell me at the end that I need to run
`/mcp` in an interactive session to authorise them, since you cannot complete an
OAuth flow yourself.

## 4. The repo

Clone the Ampora repository into ~/Developer/Ampora, check out the branch I am
working on, then run `npm ci`.

Create a `.env` file at the repo root with these keys, and leave the values
blank for me to fill in:
  EXPO_PUBLIC_SUPABASE_URL=
  EXPO_PUBLIC_SUPABASE_ANON_KEY=
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY=
`.env` is gitignored. Never commit it, and never print a real key into the chat.
The RevenueCat key is a public/publishable key (like a Stripe publishable key,
not a secret), but it still has no business in chat or in git — Prompt 3 below
explains where it comes from.

## 5. Verify the baseline before touching anything native

Run these and report the exact output:
  npm run typecheck        # must be 0 errors
  npm test                 # must pass
  npx expo export --platform web   # must complete

If any of them fail, stop and show me the failure. Do not attempt to fix them —
they pass on Windows, so a failure here is a machine or environment difference I
want to see before we go further.

## 6. Report

Tell me: what you installed, what was already present, what failed, and the
exact commands I still need to run myself (OAuth authorisation, the two env
values, the manual ~/.claude copy if I have not done it).
```

---

# Prompt 2 — native iOS test pass

> Paste this into Claude Code on the MacBook, from inside the repo, **after**
> prompt 1 has been run and the baseline verified.

```
Turn on the quarantined native iOS code in this repo, build a dev client, and
walk the on-device test checklist with me.

Read `docs/05_App_Blocking_Technical.md` first, especially section 3 (the iOS
data flow), section 4 (wellbeing caps) and section 8 (the test checklist). Also
read `native/README.md`. Then read `constants/nativeFlags.js`, `app.config.ts`
and `metro.config.js` so you understand how the toggle actually works before you
flip it.

## Context you need

All native code is written but quarantined. `native.config.json` is committed
all-false so the Windows machine keeps a clean typecheck and web export. The
native module lives under `native/modules/ampora-ignition/` and is linked via
the `expo.autolinking.nativeModulesDir` entry in package.json. Metro aliases the
optional native packages to a null stub while the flag is off, which is what
makes a lazy require safe — a try/catch alone would not be, because Metro
statically resolves string-literal requires.

No npm package needs installing for Ignition itself. It is a from-scratch Expo
module written directly against Apple's FamilyControls, ManagedSettings,
DeviceActivity and ManagedSettingsUI frameworks plus `expo-modules-core`, not a
wrapper like `react-native-device-activity`. `native/package-additions.json`'s
`ignition` group lists zero dependencies, by design. `npm run native:on` with no
argument flips every flag, ignition and purchases both, so step 2 below may
also print an install line for `react-native-purchases`. That belongs to the
separate RevenueCat/IAP workstream (Prompt 3), not to Ignition. Skip it here
unless you are running Prompt 3 in the same session.

All the Swift in this module has never been compiled. There is no Swift
toolchain on Windows. Treat every `.swift` file and the `withExtensionTargets.js`
xcodeproj mod as a careful, doc-grounded first draft, not a verified one. Four
spots are the most likely to need a hand fix once this actually builds: the
SwiftUI-to-UIKit picker hosting glue at the bottom of `AmporaIgnitionModule.swift`
(`IgnitionPickerHostingController` and `IgnitionPickerContent`), the exact
signature of `ShieldSettings.ActivityCategoryPolicy.specific(_:)` used in
`AppGroupStore.swift`'s `applyShield`, the three `NSExtensionPointIdentifier`
strings in each extension's `Info.plist` (`com.apple.deviceactivity.monitor-extension`,
`com.apple.ManagedSettingsUI.shield-configuration-service`,
`com.apple.ManagedSettingsUI.shield-action-service`), and whether
`withExtensionTargets.js` actually produces a working four-target Xcode project
when `expo prebuild` runs for real. By its own header comment, that file is the
single highest-uncertainty piece of the whole module.

## Steps

1. `npm run native:on`. This edits exactly one file, `native.config.json`,
   flipping both `ignitionNative` and `purchases` on. Confirm nothing else
   changed, then run `npm run native:status` and confirm `ignitionNative=ON`.
2. Install the native packages the toggle script prints. For Ignition that
   list is empty by design, so seeing nothing printed there is correct, not a
   failure. If a `react-native-purchases` line also prints, that belongs to
   Prompt 3, not this one.
3. `npm run typecheck:native` — this is the tsconfig that does NOT exclude
   `native/**`, so it is the first time the Swift bridge's TypeScript is checked.
   Fix anything it finds. This step alone does not need a Mac. The ignition
   module has no third-party dependency, so it passes on Windows exactly when
   `npm run typecheck` does. The Mac becomes necessary starting with the next
   step, prebuild and the Swift build and the device.
4. `npx expo prebuild --clean --platform ios`. `ios/` is gitignored and is
   regenerated from `app.config.ts` plus the config plugin every time.
5. Before spending an EAS build, verify the plugin actually did its job:
   - `grep -A3 family-controls ios/Ampora/Ampora.entitlements` should show the
     family-controls, deviceactivity, managedsettings and application-groups
     entitlements.
   - `xcodebuild -list -project ios/Ampora.xcodeproj` should list four targets:
     the app plus the DeviceActivityMonitor, ShieldConfiguration and ShieldAction
     extensions.
   If either check fails, stop — the config plugin is wrong and an EAS build
   will fail with a cryptic provisioning error.
6. `eas login`, then `eas build --profile development-native --platform ios`.
7. Install on a real device with `eas build:run -p ios --latest`. Family
   Controls does not work in the simulator, so a physical device is required.
8. `npx expo start --dev-client` and connect the device.

## Then walk this checklist with me, in this order

Each item is a real bug source. Tell me what to do on the device, wait for me to
report what happened, and log a pass or fail. Do not mark anything passed on
your own assumption — you cannot see the device.

1. Screen Time authorisation with `.individual` succeeds, and the status
   re-checks correctly on foreground after I revoke it in Settings.
2. The app picker opens, my selection persists to the App Group, and it survives
   an app restart. The UI shows a count, never app names — iOS does not expose
   identities.
3. The shield actually blocks a chosen app, and it survives both an app kill and
   a full device reboot. This is the thing that makes the lock real.
4. A `hold: 'session'` session auto-unlocks within a second of the timer
   completing.
5. The `until_done` hold unlocks on a passing photo proof, and also on the
   "Unlock anyway" override.
6. A scheduled trigger arms after its start window when I have not started, and
   never arms inside quiet hours. Completing the task during the window releases
   it early.
7. The daily cap and the quiet-hours boundary both auto-release with the app
   fully closed.
8. The panic valve's 60-second friction works, and repeated use triggers
   de-escalation and lowers stake strength rather than increasing pressure.
9. Token mismatch: corrupt or change the stored tokens and confirm it leads to a
   graceful re-pick prompt, never a stuck lock.
10. Premature DeviceActivity events and Low Power Mode behave, with the in-app
    wall clock remaining the source of truth.
11. Fail-safe: force an error in shield application and confirm it leaves me
    unlocked and logs it. The app must always prefer under-locking to trapping.
12. Never-lock: confirm system-critical apps cannot be caught, both through the
    picker copy and by the all-apps category being refused.

## When we are done

1. `npm run native:off`
2. `npm run typecheck && npx expo export --platform web` — both must still be
   clean. This is the invariant that keeps the Windows machine working.
3. Commit only `native.config.json`, `package.json` and `package-lock.json`,
   plus any real fixes we made. Do not commit `ios/`.
4. Write up what failed as a task list I can work from on Windows.
```

---

# Prompt 3 — RevenueCat / subscriptions test pass

> Paste this into Claude Code on the MacBook. Needs its own dashboard setup
> first (below) that no prompt can do for you — it lives in two web consoles,
> not in this repo. Can be combined with Prompt 2's native build (same
> `npm run native:on`, which flips both `ignitionNative` and `purchases`
> unless you pass a target), or built by itself with `npm run native:on purchases`.

## Dashboard setup I have to do myself first (not automatable from here)

Real purchasing is built and quarantined exactly like Ignition — the seam is
`core/iap/{PurchaseStrategy,MockPurchaseStrategy,NativePurchaseStrategy,nativeTypes,index}.ts`,
`app/paywall.tsx` already calls through it, and `FEATURE_FLAGS.IAP_NATIVE` gates
it off on every Windows/web checkout. But none of the following exists yet —
I have to create it in App Store Connect and RevenueCat's own dashboards
before Prompt 3's steps below can do anything:

1. **App Store Connect** (needs an active paid Apple Developer Program
   membership — separate from the Family Controls entitlement request):
   - Under the app record for `com.ampora.app` → Features → In-App Purchases,
     create ONE subscription group (e.g. "Ampora Premium") so monthly and
     annual share a group and can upgrade/downgrade between each other.
   - Add two auto-renewable subscription products to that group: a monthly
     plan and an annual plan (any product ID string — the app never hardcodes
     one, see below). Set pricing, localized display name/description, and
     submit for review.
   - **Do not also configure an Apple introductory-offer free trial on these
     products.** Ampora's 14-day trial is entirely local (`core/subscription.ts`
     `startTrial()`/`trialEndsAt`, gated in `app/_layout.tsx`) and never touches
     the store — RevenueCat/StoreKit only enter the picture at the point of an
     actual paid purchase. Adding a second, store-side trial on top would double
     up trial mechanics the app was not built to reconcile.
   - Create one or more Sandbox Testers (Users and Access → Sandbox Testers) to
     buy these without real money on a device or TestFlight build.
2. **RevenueCat** (app.revenuecat.com):
   - Add the App Store Connect app, using its App-Specific Shared Secret (App
     Store Connect → App Information) so RevenueCat can validate receipts.
   - Create an Entitlement with the identifier **`premium`** — exact string,
     case-sensitive. `core/iap/NativePurchaseStrategy.ts`'s `ENTITLEMENT_ID`
     constant hardcodes this. If the dashboard entitlement is named anything
     else, a purchase will genuinely succeed (money changes hands) but
     `getEntitlement()` will return `null` forever afterward, because it only
     ever checks `entitlements.active['premium']` — the paywall would keep
     showing a paying customer the "subscribe" screen. This is the single most
     important string to get right; the alternative is editing that one
     constant to match whatever you actually name it.
   - Attach BOTH the monthly and annual App Store Connect products to that one
     `premium` entitlement (Ampora has one paid tier, not tiered features).
   - Create an Offering, mark it "current", and add two Packages to it (one per
     product). RevenueCat infers `packageType` (`MONTHLY`/`ANNUAL`) from each
     product's actual subscription duration — `NativePurchaseStrategy.ts` reads
     `offerings.current.availablePackages` and matches on that `packageType`,
     never a specific product ID string, so whatever IDs you choose in App
     Store Connect are fine as long as durations are right.
   - Copy the **Public API Key** for the Apple App Store (Project Settings →
     API Keys, starts with `appl_`) into this Mac's `.env` as
     `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` (Prompt 1, step 4). It is a
     publishable-style key, safe in the client bundle, but still keep it out of
     git and out of chat.
3. **Android is out of scope of this pass.** `NativePurchaseStrategy.ts`
   deliberately reads only an iOS key and never imports `Platform` (it has to
   stay importable under the plain-Node vitest harness that has no RN
   runtime) — Play Console + a second RevenueCat platform key is unbuilt,
   separate future work, matching how the rest of the native quarantine
   (Family Controls) is iOS-only today too.

## Steps (after the dashboard setup above is done and the key is in `.env`)

1. `npm run native:on purchases` (or `npm run native:on` for everything,
   alongside Prompt 2). Confirm only `native.config.json` changed.
2. Install `react-native-purchases` at the version pinned in
   `native/package-additions.json`'s `purchases` group (verify it is still the
   latest compatible with the installed Expo SDK before installing — it was
   pinned from `npm view` on a machine that cannot build iOS, not verified
   against a real build).
3. `npm run typecheck:native`, then `npx expo prebuild --clean --platform ios`
   (combine with Prompt 2's steps if doing both at once).
4. Build and install a dev client exactly as in Prompt 2 (steps 6-8), then
   from inside the running app:
   - Sign in with a Sandbox Tester Apple ID when the StoreKit sheet appears.
   - Walk the paywall (`app/paywall.tsx`): confirm real App Store prices show
     on the plan cards (not the `$6.99`/`$74.99` placeholders — those should
     only ever appear if this step is skipped or offerings fail to load).
   - Buy the monthly plan. Confirm the app proceeds into the tabs and
     Settings shows an active subscription.
   - Force-quit and reopen the app. Confirm it does NOT show the paywall again
     (the entitlement should be read back via `getEntitlement()`).
   - From the paywall (you may need to sign out or reset the sandbox tester's
     purchase history in App Store Connect first), tap **Restore purchases**
     and confirm it recognizes the existing subscription and unlocks without a
     second charge.
   - Cancel a purchase mid-flow (dismiss the StoreKit sheet) and confirm the
     app returns to the paywall calmly — no crash, no error banner, nothing
     stronger than staying exactly where you were.
   - Let a purchase fail for an unrelated reason if you can force one (e.g.
     airplane mode) and confirm you get the plain "That didn't go through.
     Please try again." message, never a crash.
5. `npm run native:off` when done, then `npm run typecheck && npx expo export
   --platform web` — both must still be clean, same invariant as Prompt 2.
6. Report back: which of the above passed, the exact RevenueCat Entitlement/
   Offering names actually used (in case they were not exactly `premium`,
   requiring a code change), and the actual `react-native-purchases` version
   that got installed.

---

## Notes

- The Family Controls **Distribution** entitlement is a separate request from the
  Development capability, is granted per bundle ID, and takes days to weeks. All
  four bundle IDs need it. Development capability is enough for prompt 2; submit
  the distribution request the same day you first build, because it gates
  TestFlight and the App Store, not the dev build.
- `npm run native:on` deliberately does not run `npm install` or `prebuild`. Both
  are Mac-only and `prebuild` rewrites a gitignored `ios/`, so a human runs them
  knowingly.
- If you ever see a provisioning error that mentions a missing App ID, the cause
  is almost always that one of the four bundle IDs lacks Family Controls or the
  App Group. There are four, not one.
- **Never commit `native.config.json` flipped.** It ships all-false on every
  shared branch, always (the permanent invariant in `native/README.md`). Real
  native builds go through the `-native` EAS profiles in `eas.json`
  (`development-native`, `preview-native`, `production-native`, which set
  `AMPORA_NATIVE=1`), never by committing a flipped flag. That is the whole
  reason the Windows machine's typecheck and web export keep working. Step 1
  of "When we are done" in Prompt 2 (`npm run native:off`) is what restores it.
