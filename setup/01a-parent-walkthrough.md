# The parent's walkthrough (send this to him)

The Apple steps only the Account Holder can do, written for someone who is not a developer and does not need to become one. Everything below the divider is meant to be sent to him as-is, so it repeats context deliberately and avoids repo jargon.

`01-apple.md` is the reference version of the same material, written for Aria. This file is the send-it version. **If a fact changes, change it in both.**

## Status: ALL FOUR PARTS DONE, 2026-08-07

Every part below was completed on 2026-08-07 in the Apple account of **Ali Nabavizadeh, Team ID `Z3X3PQU95V`**, with him present and consenting. **This file no longer needs to be sent to anyone.** It is kept as the record of what was done and as the reference if any of it ever has to be redone.

| Part | What | Done? |
|---|---|---|
| 1 | App Group `group.com.ampora.blocker` registered | **Yes** |
| 2 | Four App IDs registered, App Groups + Family Controls (Development), group assigned to each | **Yes** |
| 3 | App Store Connect Team Key generated and downloaded | **Yes** |
| 4 | Family Controls (Distribution) entitlement requested | **Yes, and already `Assigned`** |

Verified by reloading every page afterwards, not just by the success screens.

**`01b-apple-session-log.md` is the exhaustive click-by-click record** of that session, including the real contents of every form and the traps that cost time. Read it before doing anything in Apple's portal.

### The identifiers as they now exist

| Description | Bundle ID | Portal internal ID |
|---|---|---|
| Ampora | `com.ampora.app` | `4H2K8M6X64` |
| Ampora Device Activity Monitor | `com.ampora.app.AmporaDeviceActivityMonitor` | `66SYG64TJF` |
| Ampora Shield Configuration | `com.ampora.app.AmporaShieldConfiguration` | `3G225BYXKM` |
| Ampora Shield Action | `com.ampora.app.AmporaShieldAction` | `H4S4T49L5X` |

All four carry App Groups (with `group.com.ampora.blocker` assigned) and Family Controls (Development), and all four show Family Controls (Distribution) status **`Assigned`**. Every string was checked against `app.config.ts` before being typed, not against this document.

The App Store Connect Team Key is **Key ID `NQ9F796882`**, Issuer ID `72621750-6b7d-4a97-88a6-aaefa9b2b3ae`, access **Admin**, name `Ampora EAS`. The `.p8` downloaded to `C:\Users\Aria\Downloads\AuthKey_NQ9F796882.p8`. **Apple allows that download exactly once**, so move it somewhere durable and never commit it. `.gitignore` already blocked `*.p8` before any of this (line 16), but the repo is public, so treat that as a backstop and not a licence to keep the key near the tree.

## What was wrong in this document, corrected by doing it

Recorded deliberately, because the wrong version was confidently written and would mislead again.

**Part 4 was wrong in its central claim. It is ONE request for the whole team, not four per App ID.** The real form at `developer.apple.com/contact/request/family-controls-distribution/` has exactly four fields: Name, Email, Team ID, and a Terms acknowledgment. All three inputs arrive prefilled from the signed-in account and are not editable. There is **no bundle ID field, no framework checkboxes, and none of the eight prepared free-text answers** this document used to contain. The submit button reads **"Get Entitlement"**. Apple's page states the entitlement is "assigned to your developer account", which is why one submission covered all four bundle IDs at once.

**The old Part 4 answers are therefore dead text.** They were accurate about the app, but there is nowhere to put them. They have been deleted rather than left to imply a form that does not exist. If Apple ever asks follow-up questions by email, the accurate descriptions still live in `docs/04_Ignition_Sessions_and_Verification.md` and `docs/05_App_Blocking_Technical.md`.

**The Capability Requests tab is not a separate route.** Its "Request" control is a plain `<a href>` to that same contact form, opening in a new tab. The old reasoning that the tab "keeps him on the page" and stops him "structurally forgetting one of the four" was wrong on both counts.

**It was not a four-day-to-six-week wait.** Status went to `Assigned` immediately, visible on reload of all four App IDs within a minute of submitting. Do not tell anyone to expect weeks.

**Apple's quoted line about submitting "the same request for the extension" does not describe this form.** It cannot, since the form takes no bundle ID.

**Part 3 had an undocumented prerequisite.** App Store Connect showed "Permission is required to access the App Store Connect API" with a **Request Access** button, and no Team Keys tab at all until that was submitted. It carries its own agreement, was approved instantly, and only then did Team Keys appear. Also note the Access control is a multi-select labelled "Select Roles" (Admin / App Manager / Developer / Finance / Sales and Reports), not the plain dropdown described below.

**The capability checkbox is labelled "Family Controls (Development)", not "Family Controls".** There is a neighbouring, different checkbox called **"Family Controls App and Website Usage"** which was deliberately left OFF, because that one covers `DeviceActivityReport` usage data and Ampora never uses it.

**Saving an App ID pops an unlabelled confirmation.** After Save, a "Modify App Capabilities" modal appears warning that provisioning profiles will be invalidated. Nothing persists until Confirm is clicked. Missing it silently reverts the change, which happened twice before it was spotted.

**App Groups cannot be assigned while creating an App ID.** The Configure button only exists on the edit page afterwards. So the flow is: register all four, then edit each one to attach the group.

**The App Group identifier field auto-prefixes `group.`** Typing the full `group.com.ampora.blocker` yields `group.group.com.ampora.blocker`. Type only `com.ampora.blocker`.

**One thing worth flagging, unresolved.** The App Store Connect API agreement says "you may not share authorization credentials with anyone outside your team". On an individual membership the team is one person. Handing the `.p8` to Aria was done with the account holder's explicit consent, and the key is revocable at any time from that same page, but the tension is real and is recorded here rather than smoothed over.

**Do not tell him to be added to the team as an Admin.** Impossible on an individual membership. See `01-apple.md` Part 3.

---

Subject: Ampora Apple setup, about 45 minutes, step by step

Hi Aria's dad,

I'm Claude, the AI Aria has been building Ampora with. Aria asked me to write these instructions out for you directly, so that's what this is. I did the research on exactly where every button is so you don't have to figure any of it out.

Everything I need from your Apple account is below. About 45 minutes, all of it clicking through forms.

To be clear about what this does **not** do: it does not publish anything, does not submit anything to the App Store, does not put your name on anything public, does not cost money, and does not sign you up for anything new. It registers four ID strings, creates one access key for Aria, and sends four permission requests to Apple.

**If anything below is unclear, or a screen doesn't look like what I described, please don't guess.** Take a screenshot, send it to Aria, and Aria will show it to me. I'll tell you exactly what to do from there. That's much faster than getting it wrong and redoing it.

Please do the parts in order, because later parts depend on earlier ones.

## PART 1: Create the App Group

**Step 1.** Go to **developer.apple.com/account** and sign in with your Apple ID.

**Step 2.** Click **Certificates, Identifiers & Profiles**.

**Step 3.** In the left sidebar, click **Identifiers**.

**Step 4.** Click the **add button (+)** at the top left, next to the word Identifiers.

**Step 5.** From the list, select **App Groups**. Click **Continue**.

**Step 6.** Fill in the two boxes exactly like this:

- Description: `Ampora Blocker Group`
- Identifier: `group.com.ampora.blocker`

**Step 7.** Click **Continue**, then on the review screen click **Register**.

Part 1 done. You should be back on the Identifiers list.

## PART 2: Register four App IDs

The app is built as four separate pieces, and Apple treats each one as its own registration. All four are required. If even one is missing, nothing works, and the error message will not tell you which one, so please don't skip any.

You'll repeat the same nine steps four times. The only thing that changes is two text values, given in the list after the steps.

**Step 8.** On the Identifiers page, click the **add button (+)** again.

**Step 9.** Select **App IDs**. Click **Continue**.

**Step 10.** On the next screen select **App**. Click **Continue**.

**Step 11.** In the **Description** box, type the Description for this round from the list below.

**Step 12.** Just under that, leave **Explicit** selected. Do not pick Wildcard.

**Step 13.** In the **Bundle ID** box, type the Bundle ID for this round. It is case sensitive, so capital letters matter. Copy and paste it if you can.

**Step 14.** Scroll down to the **Capabilities** list. It's long. Tick exactly two checkboxes:

- **App Groups**
- **Family Controls**

**Step 15.** On the **App Groups** row you just ticked, click **Configure**. A table appears. Tick **Ampora Blocker Group**. Click **Continue**, then **Assign**, then **Done**.

**Step 16.** Click **Continue** at the bottom, then on the review screen click **Register**.

Then go back to Step 8 and do it again with the next round. Four rounds total.

**Round 1**
- Description: `Ampora`
- Bundle ID: `com.ampora.app`

**Round 2**
- Description: `Ampora Device Activity Monitor`
- Bundle ID: `com.ampora.app.AmporaDeviceActivityMonitor`

**Round 3**
- Description: `Ampora Shield Configuration`
- Bundle ID: `com.ampora.app.AmporaShieldConfiguration`

**Round 4**
- Description: `Ampora Shield Action`
- Bundle ID: `com.ampora.app.AmporaShieldAction`

**Step 17.** Check your work. The Identifiers list should now show all four names. Click into any one of them and you should see App Groups and Family Controls listed under its capabilities.

## PART 3: Create an access key for Aria

This is the part that means you don't have to sit with Aria every time the app gets built. Without it, every single build needs you present to type your password and read a code off your phone.

**Step 18.** Go to **appstoreconnect.apple.com/access/users**. Different Apple site from Part 1, same login.

**Step 19.** In the left sidebar, click **Integrations**. The page opens with **App Store Connect API** already selected.

**Step 20.** Click **Team Keys**. This matters. There's also an Individual Keys tab, and an individual key will not work for this.

**Step 21.** Click **Generate API Key**. If you already have keys and don't see that button, click the **add button (+)** instead.

**Step 22.** In the **Name** box, type: `Ampora EAS`

**Step 23.** Under **Access**, choose **Admin** from the dropdown.

**Step 24.** Click **Generate**.

**Step 25.** On the new key's row, click **Download**. This saves a file called something like `AuthKey_ABC123XYZ.p8`.

**Apple only lets this file be downloaded once, ever.** If it gets lost, the key has to be deleted and Part 3 done again. Save it somewhere safe before doing anything else.

**Step 26.** Send Aria three things:

1. That `.p8` file
2. The **Key ID**, a 10-character code shown on the key's row
3. The **Issuer ID**, a longer code with dashes in it, shown near the top of the same page above the list of keys

**What this key can do:** create the security certificates needed to install the app on Aria's phone, and register that phone as a test device.

**What it cannot do:** spend money, publish anything, submit anything to the App Store, or change your membership or billing.

You can delete it at any time from that same page, and deleting it breaks nothing except the ability to build. If you ever want it gone, click into it and revoke it.

## PART 4: One permission request to Apple

**Done on 2026-08-07. Status came back `Assigned` immediately.** Kept here because the original version of this part was wrong in a way worth remembering.

Apple restricts the feature the whole app is built around, which is letting someone lock their own distracting apps for a set amount of time. You have to ask Apple's permission for it.

**It is one request for the whole developer account, not one per App ID.** Apple's own wording on the form is that the entitlement is "assigned to your developer account". One submission covered all four bundle IDs.

**Step 27.** Go to **developer.apple.com/contact/request/family-controls-distribution/** while signed in.

You can also reach it from Identifiers, clicking an identifier's name, then the **Capability Requests** tab, then the link next to **Family Controls (Distribution)**. That link goes to the exact same page in a new tab, so it is the same request either way.

**Step 28.** The form has three fields, **all filled in for you and not editable**: Name, Email, Team ID. There is nothing to type.

**Step 29.** Read the Terms and Conditions. The part that matters is that the app's primary purpose must be one of two things, and Ampora is squarely the second:

> offering individuals the ability to manage their devices to enable focus and productivity through focus controls, timers and task management, or personal device usage management

The terms also forbid using the framework for ad blocking, in organizational settings, or to manage another adult's device, and forbid sharing device or usage data for advertising or with data brokers. Ampora does none of these: the lock is self-imposed, `.individual` only, and no usage data ever leaves the device.

**Step 30.** Click **Get Entitlement**.

You get "Thank you for your submission. We'll review your request and contact you soon with a status update."

**There is no bundle ID field, no framework checkboxes, and no free-text boxes.** Earlier versions of this document contained eight prepared paragraphs for fields that do not exist. They have been deleted. If Apple ever follows up by email, the accurate technical descriptions live in `docs/04_Ignition_Sessions_and_Verification.md` and `docs/05_App_Blocking_Technical.md`.

## What happened after

Apple sent no confirmation email, just the thank-you message on screen. That is normal.

**The status was `Assigned` within a minute**, on all four App IDs, checked by reloading each one. The old text here predicted four business days to six weeks. That was wrong, and nobody should be told to expect a wait.

To check it yourself at any time: Identifiers, click the identifier's name, **Capability Requests** tab, look at the **Family Controls (Distribution)** row. `Assigned` is the finished state. If any email from Apple about this ever arrives, forward it to Aria.

Thanks for doing this.

Claude
