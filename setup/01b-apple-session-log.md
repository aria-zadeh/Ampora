# Apple Developer portal session log, 2026-08-07

An exhaustive, action-by-action record of everything done inside Apple's websites on 2026-08-07. Written so a future session never has to re-derive any of it, never repeats a mistake made here, and never wonders whether something was actually done or merely planned.

**Nothing in this file is a plan or a proposal. Every line describes something that happened.**

The short version lives in `01a-parent-walkthrough.md`'s Status block. This file is the long version, including the wrong turns.

## Setup

- **Account:** Ali Nabavizadeh (Aria's dad), Account Holder of the paid **individual** Apple Developer Program membership. Email on file `nabavia@gmail.com`.
- **Team ID:** `Z3X3PQU95V`
- **Consent:** Aria approved all four parts. Aria's dad was physically present, and separately stated his own approval in the chat before the irreversible steps (the API-access agreement, the key download, and the entitlement submission).
- **How:** driven through the Claude in Chrome extension against a Chrome profile signed into his Apple ID on Aria's Windows machine. No password or 2FA code was ever typed by the agent, the session was already authenticated.
- **Starting state:** Identifiers list completely empty. Nothing had been done before this session.

## Part 1: the App Group

1. Went to `developer.apple.com/account/resources/identifiers/list`. Confirmed signed in as Ali Nabavizadeh, `Z3X3PQU95V`, and confirmed the list was empty.
2. Clicked **+** next to Identifiers.
3. Selected **App Groups**, clicked Continue.
4. Typed Description `Ampora Blocker Group`.
5. **First mistake here.** Typed the full `group.com.ampora.blocker` into the Identifier box and it became `group.group.com.ampora.blocker`. **The field auto-prefixes `group.`** Cleared it and typed only `com.ampora.blocker`, which rendered as `group.com.ampora.blocker`.
6. Continue. The review screen showed Description `Ampora Blocker Group` and Identifier `group.com.ampora.blocker`, verified against `app.config.ts`'s `APP_GROUP` constant before proceeding.
7. Clicked **Register**. Landed back on the Identifiers list showing the new App Group.

**Result:** App Group `group.com.ampora.blocker` exists.

## Part 2: the four App IDs

Same nine-step flow four times: **+** → App IDs → Continue → App → Continue → Description → Bundle ID (Explicit) → tick capabilities → Continue → Register.

Values used, each checked against `app.config.ts` (`BUNDLE_ID` and `APP_EXTENSIONS`) rather than against any document:

| Round | Description | Bundle ID |
|---|---|---|
| 1 | `Ampora` | `com.ampora.app` |
| 2 | `Ampora Device Activity Monitor` | `com.ampora.app.AmporaDeviceActivityMonitor` |
| 3 | `Ampora Shield Configuration` | `com.ampora.app.AmporaShieldConfiguration` |
| 4 | `Ampora Shield Action` | `com.ampora.app.AmporaShieldAction` |

Capabilities ticked on every one: **App Groups** and **Family Controls (Development)**.

**`Family Controls App and Website Usage` was deliberately left OFF on all four.** It is a separate, adjacent checkbox covering `DeviceActivityReport` usage data. Ampora never calls `DeviceActivityReport` (verified by grep across `native/`), so enabling it would have asked Apple for more than the app needs. Do not turn it on later without a reason.

### What the create form does NOT let you do

**App Groups cannot be assigned during creation.** Ticking the App Groups checkbox on the create form shows no Configure button. The `Configure` button only exists on the **edit** page after the App ID is registered. So the real flow is: register all four first, then edit each one to attach the group.

This is a direct contradiction of the old walkthrough's Step 15, which told the parent to click Configure during creation.

### The Save confirmation that silently eats changes

Going back into each App ID to attach the group:

1. Open the App ID's edit page.
2. Click **Configure** on the App Groups row.
3. A modal titled **App Group Assignment** opens, listing `Ampora Blocker Group / group.com.ampora.blocker` with a counter reading `0 of 1 item(s) selected`.
4. Tick the group. Counter must change to `1 of 1 item(s) selected`. **Verify this counter, not the checkbox's DOM state**, see the tooling notes at the bottom.
5. Click **Continue**. The modal closes and the row reads `Enabled App Groups (1)`.
6. Click **Save**.
7. **A modal titled "Modify App Capabilities" appears**, warning that "Adding or removing any capabilities will invalidate any provisioning profiles that include this App ID and they must be regenerated for future use." It has Cancel and **Confirm**.
8. Click **Confirm**. The page redirects to the Identifiers list, which is what success looks like.

**Steps 7 and 8 cost two failed attempts.** Twice the change appeared to save, the page still showed `Enabled App Groups (1)`, and a reload showed `Enabled App Groups (0)`. The cause was this modal sitting open and un-dismissed, invisibly blocking the Save. Nothing warns you. **Always reload and re-read after saving anything in this portal.**

No provisioning profiles existed yet, so the invalidation warning had no effect.

### Final Part 2 state, each verified by page reload

| Description | Bundle ID | Portal internal ID | App Groups | Family Controls (Dev) | Groups enabled |
|---|---|---|---|---|---|
| Ampora | `com.ampora.app` | `4H2K8M6X64` | on | on | 1 |
| Ampora Device Activity Monitor | `com.ampora.app.AmporaDeviceActivityMonitor` | `66SYG64TJF` | on | on | 1 |
| Ampora Shield Configuration | `com.ampora.app.AmporaShieldConfiguration` | `3G225BYXKM` | on | on | 1 |
| Ampora Shield Action | `com.ampora.app.AmporaShieldAction` | `H4S4T49L5X` | on | on | 1 |

The internal IDs are the stable way to deep-link an App ID's edit page:
`https://developer.apple.com/account/resources/identifiers/bundleId/edit/<ID>`

## Part 3: the App Store Connect Team Key

### The prerequisite nobody documented

Went to `appstoreconnect.apple.com/access/integrations/api`. **There was no Team Keys tab at all.** The page read:

> Permission is required to access the App Store Connect API. You can request access on behalf of your organization.

with a single **Request Access** button. The old walkthrough's Steps 19 to 21 assume Team Keys is already there, and it is not on an account that has never used the API.

Clicking Request Access opened a modal with a mandatory agreement checkbox. Its text, recorded because one clause matters:

> The App Store Connect API is for internal development, testing, and reporting purposes within your team only [...] You may not use this App Store Connect API to provide services to any third parties or for any other use. As a reminder, **you may not share authorization credentials with anyone outside your team** or solicit authorization credentials from any third parties. As requests are reviewed, organization will be given first access followed by individuals.

Work stopped here and the clause was raised with Aria before continuing, because the entire point of Part 3 is handing the key to Aria, and on an individual membership the team is one person. Aria's dad then approved it directly in chat. Ticked the box, clicked **Submit**.

Result was immediate: *"Your request to access the App Store Connect API was approved."* The **Team Keys** tab appeared, showing `Active (0)`. Note the "organizations first, individuals after" line did **not** translate into any delay here.

### Generating the key

1. Confirmed the **Team Keys** tab was the selected one, not Individual Keys. An individual key does not work for this.
2. Clicked **Generate API Key**.
3. Name: `Ampora EAS` (the field caps at 30 characters).
4. **Access is a multi-select labelled "Select Roles"**, not the plain dropdown the old docs described. Options offered: Admin, App Manager, Developer, Finance, Sales and Reports. Selected **Admin**, which renders as a removable chip.
5. Clicked **Generate**.

Key created:

- **Name:** `Ampora EAS`
- **Key ID:** `NQ9F796882`
- **Issuer ID:** `72621750-6b7d-4a97-88a6-aaefa9b2b3ae`
- **Access:** Admin
- **Generated by:** Ali Nabavizadeh

### Downloading it

Clicking **Download** opens a second confirmation modal first:

> API keys can be downloaded only once. If you are not prepared to download your key at this time, click Cancel and download it at a later time. Make sure you save a backup of your key in a secure place.

Clicked **Download**. The file landed at `C:\Users\Aria\Downloads\AuthKey_NQ9F796882.p8`, 257 bytes. It was later moved to **`C:\Users\Aria\AppleKeys\AuthKey_NQ9F796882.p8`**, outside the repo tree.

**The file's contents were never opened or read**, by design. `.gitignore` line 16 already blocked `*.p8` before any of this, but the repo is public, so that is a backstop and not a reason to keep the key nearby.

For EAS:

```
EXPO_ASC_API_KEY_PATH=C:\Users\Aria\AppleKeys\AuthKey_NQ9F796882.p8
EXPO_ASC_KEY_ID=NQ9F796882
EXPO_ASC_ISSUER_ID=72621750-6b7d-4a97-88a6-aaefa9b2b3ae
```

## Part 4: the Family Controls entitlement

This is where the old documentation was most wrong.

### Discovering the route

Opened `Ampora`'s edit page and clicked the **Capability Requests** tab. A row for **Family Controls (Distribution)** exists there, showing:

- Platform Support: iOS, visionOS
- Provisioning Support: Development, Ad hoc, App Store Connect
- **Entitlement Keys: `com.apple.developer.family-controls`** (exactly one)
- Status: No Requests

That single entitlement key independently corroborates the code fix in commit `051f151` / PR #4 that removed `com.apple.developer.deviceactivity` and `com.apple.developer.managedsettings`. Apple's own portal lists neither. **Never re-add them.**

Inspected the row's "Request" control. It is not a button and not a form. It is:

```html
<a href="https://developer.apple.com/contact/request/family-controls-distribution/"
   target="_blank" aria-label="Request capability Family Controls (Distribution)">
```

**The Capability Requests tab is not a separate route.** It links to the exact contact form the old docs called the "fallback". The old reasoning, that the in-portal tab keeps you on the page and stops you forgetting one of the four, was wrong on both counts.

### The actual form

`developer.apple.com/contact/request/family-controls-distribution/`, titled **"Get the Family Controls Framework Entitlement"**. Its complete contents:

- **Name** — prefilled `Ali Nabavizadeh`, not editable
- **Email** — prefilled `nabavia@gmail.com`, not editable
- **Team ID** — prefilled `Ali Nabavizadeh - Z3X3PQU95V`, not editable (hidden field `contact_team_id` = `Z3X3PQU95V`)
- **Terms and Conditions** — text only, no checkbox
- **Get Entitlement** — the submit button

**That is the entire form.** No bundle ID field. No framework checkboxes. No "what does your app do" box. No additional information box. Nothing to type at all.

Apple's own description on that page: *"Once assigned to your developer account, you can build apps that use the capabilities of the Family Controls Framework."* **Per account, not per bundle ID.** One submission covers everything.

The old walkthrough's eight prepared free-text answers were therefore answering questions that are never asked. They have been deleted from `01a-parent-walkthrough.md`.

### The terms, and why Ampora qualifies

The app's primary purpose must be one of two things:

1. family controls for parents and guardians, through Family Sharing, to supervise children's app usage; **or**
2. *"offering individuals the ability to manage their devices to enable focus and productivity through focus controls, timers and task management, or personal device usage management"*

**Ampora is squarely the second**, and that was the basis for submitting. The terms additionally forbid use for ad blocking, in organizational settings, or for managing another adult's device, and forbid sharing device or usage data for advertising or with a data broker. Ampora does none of these: the lock is self-imposed, authorization is `.individual` only, and no usage data leaves the device.

### Submitting

Clicked **Get Entitlement**. Response:

> Thank you for your submission. We'll review your request and contact you soon with a status update.

No confirmation email arrived.

### The result, which contradicts every prediction in the old docs

Reloaded all four App IDs' Capability Requests tabs. **Every one showed Family Controls (Distribution) status `Assigned`, within about a minute of submitting.**

The old docs predicted "four business days to six weeks" and told the parent to expect a wait and to chase it after six weeks. That was wrong. There was no wait and no human review step visible from the outside.

## Verification pass

Nothing above was trusted from a success screen. After all four parts, every App ID edit page was reloaded from scratch and re-read for: Description, Bundle ID, App Groups checked, Family Controls (Development) checked, `Family Controls App and Website Usage` unchecked, `Enabled App Groups (1)`, and Family Controls (Distribution) `Assigned`. All four passed.

## What was deliberately NOT done

- **No app was created in App Store Connect.** Not needed for any of the above, and publishing is gated on the LLC (`00-my-situation.md`).
- **No provisioning profiles or certificates were created.** EAS will generate those on the first build.
- **No devices were registered.** That is `eas device:create`, and it must happen before the first build or the build will not install.
- **No `Family Controls App and Website Usage` capability**, see Part 2.
- **No individual API key**, only the Team Key. An individual key does not work for EAS.
- **Nothing was deleted or revoked.**

## Open items and honest caveats

- **The credential-sharing clause.** The API agreement forbids sharing authorization credentials outside the team, and an individual membership has a team of one. The `.p8` was handed to Aria with the Account Holder's explicit consent, and it is revocable at any time from the same page. Recorded, not resolved.
- **`Assigned` has not been proven end to end.** It means Apple granted the entitlement. It does not prove a signed build will succeed. The first `eas build` is what proves that.
- **The Organization conversion question is still open** and unchanged by this session: whether an already-granted Family Controls entitlement survives an individual-to-organization conversion is undocumented. Ask Apple before relying on it (`01-apple.md` Part 2).

## Tooling notes for driving this portal with browser automation

Learned the hard way, all on `developer.apple.com` and `appstoreconnect.apple.com`:

- **Do not click by coordinate.** The screenshot is scaled down from the real viewport (seen: 1254x620 against a 2048x1012 viewport) and the window resizes itself mid-session. Pixel clicks silently land on the wrong element or nothing. Use `find` to get an element ref and click the ref.
- **Refs die on navigation.** After any page change, re-run `find`. A stale ref either errors with "element may have been removed" or, worse, clicks nothing and reports success.
- **Verify React state, not DOM state.** A synthetic `.click()` on a checkbox can flip the DOM `checked` property without React registering it. Read the page's own rendered counter (`1 of 1 item(s) selected`) as the source of truth.
- **Screenshots time out on these pages** with `Page.captureScreenshot timed out, renderer may be frozen`. `get_page_text` and JavaScript reads keep working when screenshots do not.
- **Identifier rows are not links.** The names are bare `<div>`s inside `<span>`s with a router click handler and no `href`. Walk shadow roots to find the leaf element whose `textContent` matches, then click it. Or skip the list entirely and deep-link with the internal IDs in the Part 2 table.
- **Forms render after the URL changes.** Typing immediately after navigation goes nowhere. Poll for the input (`#description`, `#identifier`) before filling.
- **Reload and re-read after every write.** This portal will show you a saved state that did not save.
