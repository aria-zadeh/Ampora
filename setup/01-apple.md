# Apple account and the app-locking entitlement

Covers two separate things Ampora needs from Apple: permission to actually lock apps on a real device (the Family Controls entitlement), and the question of which Apple account should own all of this long-term (the parent's individual account today, versus a future LLC's organization account).

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

### It is per bundle ID, and Ampora needs four

Apple grants this entitlement separately to each individual App ID (what Apple calls a "bundle ID"). Ampora's app-locking is split across four App IDs, not one: the main app, plus three small helper extensions that do the actual blocking. Get the exact strings from `app.config.ts` in the repo (search for `BUNDLE_ID` and `APP_EXTENSIONS`) rather than trusting a copy pasted here, but as of this writing they are:

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

**2. Request the Distribution capability.** Go to [developer.apple.com/contact/request/family-controls-distribution](https://developer.apple.com/contact/request/family-controls-distribution), signed in as the account's Account Holder (see Part 3 below for who that is). Submit **one request per bundle ID, all four**, not just the main app. Each request asks for the bundle ID and an explanation of how the app uses the FamilyControls, ManagedSettings, and DeviceActivity frameworks.

- **What to write for the use case:** describe Ampora as a self-directed focus tool, in the same spirit as apps like Opal and Brick (`docs/05_App_Blocking_Technical.md` §9 has this framing in more detail). The points to hit: the user restricts their own device, by their own choice, there is no parental or child mode, no remote control by anyone else, and no usage data collected for advertising.
- **What success looks like:** no confirmation email arrives right away, just a "thank you" message on submission. That is normal, not a sign anything failed. Weeks later, an email either approves the request (after which **Family Controls (Distribution)** becomes a toggle under **Additional Capabilities** on each of the four Identifiers) or asks for more detail (resubmit with a fuller explanation of the use case).
- **What failure looks like:** total silence past roughly 6 weeks. At that point, follow up through Apple Developer Support ([developer.apple.com/contact](https://developer.apple.com/contact)) rather than resubmitting from scratch.

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

Register the four App IDs and request the entitlement under the current individual account now. Form the LLC on whatever timeline makes sense for the business. Convert that same account to an Organization membership once the LLC exists. Do not create a second Apple account and try to transfer the app later.

### One open question, flagged honestly

Whether converting Individual to Organization membership preserves an entitlement grant already approved on the account (like an approved Family Controls Distribution request) is **not documented either way**, as best as this file's research could confirm. It is a reasonable assumption that it does, since Apple describes the conversion as keeping "the same account," but it should be **confirmed directly with Apple Developer Support**, ideally soon after the entitlement is first approved, rather than assumed.

## Part 3: who does what (parent vs teen)

The Apple Developer Program is a paid, contractual membership. Only an adult can be the legal **Account Holder** on it, which is why a parent holds this account.

Only the Account Holder (the parent's Apple ID) can:

- Submit the Family Controls Distribution request (Part 1, step 2)
- Agree to any updated Apple Developer Program License Agreement
- Later, do the Individual to Organization conversion (Part 2)

The parent can add the teen as a team member with a role that covers almost everything else, without needing the parent for every click:

- At [developer.apple.com/account](https://developer.apple.com/account), open **Users and Access**, click **+**, add the teen's own Apple ID with the role **Admin** (the simplest choice, since it can manage certificates and provisioning profiles, which the build process in `04-test-the-lock.md` needs).
- Once added, the teen can register App IDs, run the `eas build` commands, and do essentially everything else in this setup folder without the parent present.

`04-test-the-lock.md` picks this thread back up at the exact point in the build process where an Apple ID gets asked for.
