# The parent's walkthrough (send this to him)

The Apple steps only the Account Holder can do, written for someone who is not a developer and does not need to become one. Everything below the divider is meant to be sent to him as-is, so it repeats context deliberately and avoids repo jargon.

`01-apple.md` is the reference version of the same material, written for Aria. This file is the send-it version. **If a fact changes, change it in both.**

## Status

Nothing here has been done yet. When it is, update this block rather than leaving it stale.

| Part | What | Done? |
|---|---|---|
| 1 | App Group `group.com.ampora.blocker` registered | No |
| 2 | Four App IDs registered with Family Controls + App Groups | No |
| 3 | App Store Connect Team Key generated and handed over | No |
| 4 | Four Family Controls (Distribution) requests submitted | No |

Part 4 is optional right now and is Aria's call. See "the one real judgement call" in `01-apple.md` Part 2. Parts 1 to 3 are what unblock testing the lock on a phone.

## What a future session should know before touching this

**The parent is signed in on the Windows machine as of 2026-08-07.** Parts 1 to 3 can be done from there directly while that session is live, rather than scheduling him again. Part 3 in particular is worth doing before that session lapses, because the Team Key is exactly what removes the need for him to be signed in anywhere ever again.

**Every button label in Parts 1, 2, 3, and the navigation of Part 4 came from Apple's own help pages**, read directly on 2026-08-07:

- `developer.apple.com/help/account/identifiers/register-an-app-id`
- `developer.apple.com/help/account/identifiers/register-an-app-group`
- `developer.apple.com/help/account/identifiers/enable-app-capabilities`
- `developer.apple.com/help/account/capabilities/capability-requests/`
- `developer.apple.com/help/app-store-connect/get-started/app-store-connect-api/`
- `developer.apple.com/documentation/familycontrols/requesting-the-family-controls-entitlement`

**The one thing that could not be verified:** the inside of the Family Controls request form. It 302s to `idmsa.apple.com` sign-in, and the forum threads that show it are behind a CAPTCHA. So the *fields* in Part 4 are prepared answers matched to likely labels, not confirmed ones. Step 31 tells him to copy the real form back rather than improvise. **When he does, put the real field names in this file and delete this paragraph.**

**Why Part 4 uses the Capability Requests tab** rather than `developer.apple.com/contact/request/family-controls-distribution`: Apple's own docs present the in-portal tab as the route, it keeps him on the page he is already on, and because the tab lives inside each App ID he cannot structurally forget one of the four. The contact form is in there as a fallback.

**Apple's wording on extensions**, which is why it is four requests and not one: "If your app includes a Screen Time API app extension such as Device Activity Monitor, Device Activity Report, Shield Action, or Shield Configuration, submit the same request for the extension."

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

## PART 4: Four permission requests to Apple

Last part. Apple restricts the feature the whole app is built around, which is letting someone lock their own distracting apps for a set amount of time. You have to ask Apple's permission for it, and a real person at Apple reads the request and decides. It takes anywhere from about four business days to six weeks, which is why it's worth sending now rather than later.

Same as Part 2, it goes four times, once per ID. I've written out every answer below, so this is copying and pasting.

**Step 27.** Go back to **developer.apple.com/account**, then **Certificates, Identifiers & Profiles**, then **Identifiers** in the sidebar.

**Step 28.** Click the **name** of the first identifier, `Ampora`, in the list.

**Step 29.** Click the **Capability Requests** tab.

**Step 30.** Find **Family Controls** in the list, and click the **Request** button next to it.

**Step 31.** A request form opens. Fill it in using the prepared answers below.

**Here's the one thing I have to be honest about.** This form sits behind an Apple sign-in, so I could not open it and see it myself. The answers below are correct and complete, but I'm not certain what the fields are actually labelled, or how many there are. **If the form doesn't match what I've written, don't try to make it fit.** Copy every question and field name off the screen into an email, or just screenshot the whole form, and send it to Aria. Aria will bring it to me and I'll write the exact answers for the real fields and send them straight back. That'll take a few minutes, not days.

**Step 32.** Submit the form.

**Step 33.** Repeat Steps 28 to 32 for the other three identifiers: `Ampora Device Activity Monitor`, `Ampora Shield Configuration`, and `Ampora Shield Action`. Everything stays identical except the Bundle ID, and one extra paragraph that gets added on those three rounds only.

If **Family Controls** does not appear on the Capability Requests tab at all, there's a backup route: go to **developer.apple.com/contact/request/family-controls-distribution** and fill in the same answers there. Same request, different door. Tell Aria if you end up using it.

### App name

```
Ampora
```

### Bundle ID (changes each round)

Round 1:
```
com.ampora.app
```
Round 2:
```
com.ampora.app.AmporaDeviceActivityMonitor
```
Round 3:
```
com.ampora.app.AmporaShieldConfiguration
```
Round 4:
```
com.ampora.app.AmporaShieldAction
```

### Website or app URL

```
https://github.com/aria-zadeh/Ampora
```

### If it asks which frameworks the app uses

Tick all three: **FamilyControls**, **ManagedSettings**, **DeviceActivity**.

### What the app does

```
Ampora is a focus and time-management app for students and people with ADHD. It automatically schedules a user's own tasks onto their calendar and helps them start work. Its core feature is a self-imposed focus session: before starting a session, the user chooses which of their own distracting apps to place off-limits, and those apps are shielded on their own device for the duration of that session only. The entire product is built around this feature. Without the Screen Time API, the app's central function does not exist.
```

### How the app uses FamilyControls

```
Ampora calls AuthorizationCenter.shared.requestAuthorization(for: .individual). It never requests .child authorization and has no parental mode, no child mode, and no ability for one person to control another person's device. The user selects which applications and categories to restrict using Apple's own FamilyActivityPicker, so the selection is made entirely inside Apple's UI. Ampora receives only opaque ApplicationTokens and never learns the identity of any app the user selected. It displays a count such as "3 apps on the line" and cannot display names, because it does not have them.
```

### How the app uses ManagedSettings

```
Ampora writes to a single named ManagedSettingsStore ("AmporaIgnitionShield"). When a user starts a focus session, it sets shield.applications, shield.applicationCategories, and shield.webDomains from the selection the user made in Apple's picker. When the session ends, is cancelled, or is released by any of the safety limits described below, all three are set back to nil. The store is used for nothing else. Ampora never modifies any other ManagedSettings domain, and never restricts anything the user did not personally select.
```

### How the app uses DeviceActivity

```
Ampora calls DeviceActivityCenter.startMonitoring with a DeviceActivitySchedule whose start and end match the focus session the user configured. A DeviceActivityMonitor extension clears the shield at the scheduled end time, so a session always ends on time even if the app is not running or the phone was restarted. Ampora does not use DeviceActivityReport and does not read, store, aggregate, or transmit any usage statistics about the user's device. DeviceActivity is used purely as a timer that can outlive the app process.
```

### Personal use or distribution

```
Distribution on the App Store.
```

### Data collection or advertising

```
No. Ampora does not collect device usage data for advertising or for any third party. It never receives the identity of the apps a user restricts, only opaque tokens issued by Apple's picker. Session records stay on the user's device and in the user's own private account.
```

### For any large free-text box, or a field called Additional Information

```
Ampora is a self-directed focus tool in the same category as Opal, Brick, and one sec. The user restricts their own device, by their own choice, for a duration they set themselves, in advance. There is no supervisor, no parent, no administrator, and no remote party who can lock or unlock anyone's device. Authorization is .individual only.

Several safeguards are built in specifically so this capability can never trap a user:

1. An escape hatch is always available. During any active session the user can end the lock early. It runs a 60-second countdown with calm, non-judgmental text, and then releases. It is never removed, never hidden, and never placed behind a payment. Repeated use makes the app offer to reduce or pause its restrictions for the rest of the day, rather than adding pressure.

2. Hard time limits the user cannot exceed. A single session can never shield apps for more than 50 minutes. Total shielded time can never exceed 180 minutes in a day, and the user can lower that limit but not raise it. Quiet hours default to 11pm to 8am and automatically release any active shield.

3. Categories that can never be restricted. Ampora refuses to shield Phone, Messages, Maps, Accessibility apps, system Settings, or Ampora itself, and refuses any "All Apps" selection. This is enforced in code, not by policy.

4. Errors fail open. Every failure path in the shield code resolves to unlocked and logs the error. A user can never be left behind a shield because something went wrong internally.

The app is aimed at students and people with ADHD, age 13 and up, who want a way to make starting work easier and slacking slightly costly, on their own terms. It has no parental control features and will not add any. The source is public at https://github.com/aria-zadeh/Ampora.
```

### Add this on rounds 2, 3 and 4 only

Paste it at the end of whichever box is largest.

```
This bundle ID is an app extension of com.ampora.app and is required for the main app's Screen Time functionality to work. AmporaDeviceActivityMonitor is the DeviceActivityMonitor extension that ends a session on schedule when the app is not running. AmporaShieldConfiguration is the ShieldConfiguration extension that renders the lock screen the user sees. AmporaShieldAction is the ShieldAction extension that handles the buttons on that lock screen, including the option to end the session early. Apple's frameworks require these to be separate extension targets, and each one carries the FamilyControls entitlement, so each needs its own approval.
```

## What happens after

Nothing to do, just so you know what to expect. Apple usually doesn't send a confirmation email for Part 4, just a thank-you message on screen. That's normal and doesn't mean it failed.

You can check on it any time: Identifiers, click the identifier's name, **Capability Requests** tab, click the **Status** button. When Apple approves it, the status changes to **Assigned**. That can take four business days to six weeks. If any email from Apple about this arrives, please forward it to Aria.

If nothing at all has happened after about six weeks, that's when something has actually gone wrong, and we chase it rather than resubmitting.

And again, if any screen looks different from what I described, screenshot it and send it to Aria rather than guessing. I'd much rather answer a question than untangle a wrong setting.

Thanks for doing this.

Claude
