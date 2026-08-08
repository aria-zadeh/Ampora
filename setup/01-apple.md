# Apple account and the app-locking entitlement

Covers two separate things Ampora needs from Apple: permission to actually lock apps on a real device (the Family Controls entitlement), and the question of which Apple account should own all of this long-term (the parent's individual account today, versus a future LLC's organization account).

**This file is the reference version, written for Aria.** To actually get the steps done, send `01a-parent-walkthrough.md` instead: same material, rewritten for the account holder, every button named, every answer pre-written, with a status table tracking what has been done. Keep the two in sync.

## Part 1: the Family Controls entitlement

### What it actually is, in plain terms

iOS does not let any app monitor or block other apps by default. It is a special, restricted permission Apple grants only to apps whose whole purpose is managing screen time (parental control tools, focus tools like Ampora). Without it, none of Ampora's app-locking works, on a real device or in the App Store.

It comes in two separate levels. This distinction is the single most important thing in this file:

- **Development.** Works immediately, the moment the capability is checked on in the Apple Developer account. No approval, no waiting, no request form. Enough to build the app and test the real lock on a real iPhone (see `04-test-the-lock.md`).
- **Distribution.** Needs Apple to manually review and approve a written request. Only required before a build can go on TestFlight or the App Store. Takes anywhere from about 4 business days to several weeks. Some developers on Apple's own forums report waiting 4 or more weeks.

### The part that catches people, including the earlier version of this file

"Development needs no approval" is true. **"Therefore the lock can be tested without a paid Apple account" is false**, and an earlier version of this document said exactly that. It is corrected here because it wasted real time.

**Family Controls is not available on a free Apple "Personal Team" at all.** It is not in Apple's supported-capabilities list for free provisioning, and there is no workaround. So:

| | Free Personal Team | Paid Developer Program |
|---|---|---|
| Build an app onto your own phone | Yes | Yes |
| **Family Controls / the app lock** | **No, not possible** | Yes |
| Ship to TestFlight or the App Store | No | Yes, once Distribution is approved |

So testing the real lock **requires the paid membership** (see `00-my-situation.md` — the parent already has one). "Free and instant" was only ever about there being no *approval wait*, not about there being no membership.

This is why the Mac asks for App IDs and an `eas login` before it will build: signing anything for a physical device needs a real team, and Family Controls needs that team to be a paid one.

**What is still true:** the Distribution request, the slow part, is not needed to test. And per `00-my-situation.md` it is not needed for a long time, since nothing ships until the app is finished and an LLC exists.

### DONE as of 2026-08-07, and the "per bundle ID" claim below was wrong

**Everything in this Part 1 was carried out on 2026-08-07 and is finished.** The App Group and all four App IDs exist with Family Controls (Development) + App Groups, and Family Controls (Distribution) shows **`Assigned`** on all four. See `01a-parent-walkthrough.md` for the full record, the portal internal IDs, and the list of corrections.

**The correction that matters most:** the Distribution entitlement is **not** granted per bundle ID. It is granted to the **developer account**. There is exactly one request form, it takes no bundle ID at all, and one submission covered all four. Step 2 below is preserved for history but its "one request per bundle ID, all four" instruction is wrong. It also came back `Assigned` in under a minute, not in weeks.

### Ampora's four bundle IDs

Ampora's app-locking is split across four App IDs, not one: the main app, plus three small helper extensions that do the actual blocking. Get the exact strings from `app.config.ts` in the repo (search for `BUNDLE_ID` and `APP_EXTENSIONS`) rather than trusting a copy pasted here, but as of this writing they are:

- `com.ampora.app` (the main app)
- `com.ampora.app.AmporaDeviceActivityMonitor` (schedules when the lock turns on and off)
- `com.ampora.app.AmporaShieldConfiguration` (the actual lock screen)
- `com.ampora.app.AmporaShieldAction` (handles the buttons on the lock screen)

All four also share one **App Group**, `group.com.ampora.blocker`. That is how the four pieces talk to each other on the device.

If a build ever fails with a provisioning error mentioning a missing App ID or capability, it is almost always one of these four missing the Family Controls or App Group entitlement, not a code problem. Check all four, not just the main app.

### Step by step

**1. Register the four App IDs.** Sign in at [developer.apple.com/account](https://developer.apple.com/account), go to **Certificates, Identifiers & Profiles** then **Identifiers**, click **+**. Register each of the four bundle IDs above as its own Identifier. For each one, turn on the **Family Controls** and **App Groups** capabilities, and set the App Group to `group.com.ampora.blocker` (create that App Group the first time it is needed, from the same **+** flow, switched to "App Groups" at the top instead of "App IDs").

- **What success looks like:** all four App IDs appear in the Identifiers list, each showing Family Controls and App Groups under its capabilities.
- A working build, a TestFlight submission, or an App Store listing are not needed to do this. Apple's own guidance is that the app needs to be created, not developed, to request the entitlement below. A registered App ID is enough.

**2. Request the Distribution capability. ONE request, for the whole account.** The form is [developer.apple.com/contact/request/family-controls-distribution](https://developer.apple.com/contact/request/family-controls-distribution).

There is only one door, despite appearances. The **Capability Requests** tab inside each App ID does show a **Family Controls (Distribution)** row, but its "Request" control is a plain link to that same contact form, opening in a new tab. It is not a separate per-App-ID form.

The form has three fields, all prefilled from the signed-in account and not editable (Name, Email, Team ID), a Terms and Conditions block, and a **Get Entitlement** button. **No bundle ID field, no framework checkboxes, no free-text boxes.** Required role: **Account Holder**.

The terms require the app's primary purpose to be either family controls via Family Sharing, or "offering individuals the ability to manage their devices to enable focus and productivity through focus controls, timers and task management, or personal device usage management". Ampora is squarely the second. The terms also forbid ad blocking, organizational use, managing another adult's device, and sharing device or usage data for advertising or with data brokers. Ampora does none of these.

Check status at **Capability Requests** on any App ID, on the **Family Controls (Distribution)** row. `Assigned` is the finished state.

- **What actually happened on 2026-08-07:** no confirmation email, just the on-screen thank-you, and the status read `Assigned` on all four App IDs within a minute. Earlier versions of this file predicted four business days to six weeks. Do not repeat that prediction.
- **What failure would look like:** a status that stays un-assigned, or an email asking for more detail. The accurate technical description of how Ampora uses FamilyControls, ManagedSettings and DeviceActivity lives in `docs/04_Ignition_Sessions_and_Verification.md` and `docs/05_App_Blocking_Technical.md` §9, and is the material to answer with.

**3. After approval, before the first real distribution build:** go back to each of the four Identifiers, turn on **Family Controls (Distribution)** under Additional Capabilities, and regenerate any provisioning profiles that existed before approval. EAS usually handles the regeneration automatically, see `04-test-the-lock.md`.

## Part 2: who legally owns the account

### The situation

See `00-my-situation.md` for the full standing context. In short: the parent holds a paid **individual** Apple Developer membership, there is **no LLC yet**, and the parent will not publish under his own personal name. The LLC gets formed **after the app is finished**, and the app publishes under it.

So the real order is: **finish the app, form the LLC, then publish.** Nothing ships before that, which means the slow Distribution entitlement is genuinely not urgent here, unlike in a project racing to submit.

What *is* needed sooner is the ability to test the lock on a phone, and that needs the parent's paid account for App ID registration and signing. Those are the steps to batch together, so he is only interrupted once.

### Recommended: register everything now, convert the account later

Apple explicitly supports **converting an existing Individual membership into an Organization membership**. It is the same account: same Apple ID, same App IDs, same entitlement grants, nothing gets recreated or transferred. This is the fact that makes "start now, formalize later" safe.

To convert, once the LLC exists:

1. Get a **D-U-N-S number** for the LLC. In plain terms, this is a free nine-digit ID number that identifies a real business, similar to a Social Security number but for companies. It is issued by Dun & Bradstreet, a company Apple partners with to confirm a business is real before letting it hold an Organization account.
   - Check first whether the business already has one, for free. Apple runs its own lookup for the UK, Australia, and Canada at [developer.apple.com/enroll/duns-lookup/](https://developer.apple.com/enroll/duns-lookup/). In the US, use [dnb.com/duns-number/lookup.html](https://www.dnb.com/duns-number/lookup.html).
   - If the business is not listed, request one for free through the same page. This needs the legal entity name, headquarters address, and a work contact.
   - **Timeline:** Dun & Bradstreet says up to 5 business days once requested, and Apple then takes up to 2 more business days to see the update. In practice, budget 1-2 weeks. Paying to expedite does not actually shorten this.
2. Once the D-U-N-S number exists, sign in at [developer.apple.com/account](https://developer.apple.com/account), open the **Membership** section, click **Update your information**, choose **Switch to organization membership**, and enter the LLC's name, website, and D-U-N-S number.
3. Apple may ask for business documents to verify the LLC (formation paperwork, an EIN, and similar). **Full verification can take up to 3 weeks on top of getting the D-U-N-S number itself.**

### The riskier alternative (not recommended)

The alternative is registering everything under a brand-new account once the LLC exists, and transferring the finished app over from the parent's account. This is **genuinely riskier**, and this file does not recommend it.

Apple's app-transfer process is built for ordinary apps. Whether a special, manually-granted entitlement like Family Controls (Distribution) survives a transfer between two separate accounts is **not documented anywhere by Apple**. Entitlements are tied to both the bundle ID and the specific account that requested them. Multiple developers have asked this exact question on Apple's own developer forums and received no answer, with some threads sitting for over a year with no response from Apple staff.

If this path is ever considered anyway, **ask Apple Developer Support directly first**, in writing, and get a real answer before relying on it. Do not assume it works.

### The recommendation

Register the four App IDs under the current individual account now, since testing the lock is blocked without them. Form the LLC on whatever timeline makes sense. Convert that same account to an Organization membership once the LLC exists. Do not create a second Apple account and try to transfer the app later.

**The Distribution entitlement is the one piece with no obvious right answer on timing.** `00-my-situation.md` governs: nothing ships for a long time, so it is not urgent. Against that, it is free, it costs about 20 minutes, and its 4-day-to-6-week wait is the only thing here that cannot be compressed later. The argument for waiting is the open question below: nobody knows whether a grant on an individual team survives the Organization conversion, so submitting early may just mean submitting twice. Aria decides. Do not quietly assume either way.

### One open question, flagged honestly

Whether converting Individual to Organization membership preserves an entitlement grant already approved on the account (like an approved Family Controls Distribution request) is **not documented either way**, as best as this file's research could confirm. It is a reasonable assumption that it does, since Apple describes the conversion as keeping "the same account," but it should be **confirmed directly with Apple Developer Support**, ideally soon after the entitlement is first approved, rather than assumed.

## Part 3: who does what (parent vs teen)

The Apple Developer Program is a paid, contractual membership. Only an adult can be the legal **Account Holder** on it, which is why a parent holds this account.

Only the Account Holder (the parent's Apple ID) can:

- Submit the Family Controls Distribution request (Part 1, step 2)
- Agree to any updated Apple Developer Program License Agreement
- Later, do the Individual to Organization conversion (Part 2)

### The correction: the teen cannot be added to the team, and the workaround that replaces it

An earlier version of this section said the parent could add the teen under **Users and Access** with the role **Admin**, after which the teen could manage certificates and run builds alone. **That is impossible on an individual membership**, which is the membership in play here (`00-my-situation.md`).

Apple's rule, verified 2026-08-07:

- "Certificates, Identifiers & Profiles is only available to Account Holders and members of an organization's team."
- An individual member may invite up to 10 people, but they "receive access only to your content in App Store Connect and are not considered part of your team in the Apple Developer Program." No certificates, no identifiers, no provisioning profiles.

This is not about the teen's age. It is purely individual-versus-organization. Adding real team members only becomes possible after the Organization conversion in Part 2, which needs the LLC.

**What replaces it: an App Store Connect API key. DONE 2026-08-07.** The parent generates one **Team Key** with **Admin** access at [appstoreconnect.apple.com/access/integrations/api](https://appstoreconnect.apple.com/access/integrations/api), under **Integrations**, **Team Keys**, **Generate API Key**, and hands over three things: the downloaded `.p8` file, the **Key ID**, and the **Issuer ID**. EAS then authenticates with that key instead of an Apple ID, and creates certificates, creates provisioning profiles, and registers devices non-interactively.

**Undocumented prerequisite, hit on the day:** if the account has never used the API, that page shows only "Permission is required to access the App Store Connect API" and a **Request Access** button, with **no Team Keys tab at all**. Request Access carries its own agreement checkbox and was approved instantly. Team Keys only appears afterwards. Also, the Access control in the generate dialog is a multi-select labelled **"Select Roles"** (Admin / App Manager / Developer / Finance / Sales and Reports), not a plain dropdown, and the download is gated behind a second **"API keys can be downloaded only once"** confirmation modal.

The real values for this project, key name `Ampora EAS`:

```
export EXPO_ASC_API_KEY_PATH=/absolute/path/to/AuthKey_NQ9F796882.p8
export EXPO_ASC_KEY_ID=NQ9F796882
export EXPO_ASC_ISSUER_ID=72621750-6b7d-4a97-88a6-aaefa9b2b3ae
```

The `.p8` currently sits at `C:\Users\Aria\Downloads\AuthKey_NQ9F796882.p8`. It cannot be re-downloaded. Move it somewhere durable, and never let it near the repo, which is public.

**One tension recorded rather than hidden:** the App Store Connect API agreement says "you may not share authorization credentials with anyone outside your team", and on an individual membership the team is one person. The key was handed over with the Account Holder's explicit consent and is revocable at any time from the same page, but the conflict is real.

Three things about that key that matter:

- It must be a **Team Key**, not an Individual Key. Individual keys cannot use the provisioning endpoints at all, which is exactly the half that builds need.
- The `.p8` downloads **once, ever**. Lost means revoke and regenerate.
- It is scoped and revocable from the same page, and it cannot publish, submit, or touch billing. It is strictly safer than the alternative, which is the parent's actual Apple ID password plus a two-factor code read aloud on every build.

Without the key, the parent has to sit in on the first `eas build` and sign in personally, and again whenever a certificate expires or a new test device is added. With it, the App ID registration above is genuinely the last time he is needed until the LLC.

`04-test-the-lock.md` picks this thread back up at the exact point in the build process where Apple authentication gets asked for.
