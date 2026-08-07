# The account situation, so it never has to be re-explained

Read this before `01-apple.md`, `04-test-the-lock.md`, or `05-revenuecat.md`. It is the standing context for anything involving Apple, money, or who owns what. Any instruction that conflicts with what is written here is wrong, and the conflict should be raised rather than worked around.

## The people and accounts

- **Aria** owns the project and does the building. Under 18.
- **Aria's dad** holds the **paid Apple Developer Program membership** (the $99/year one). It is an **individual** membership in his name.
- **There is no LLC yet**, and there will not be one for a while.

## The plan, in Aria's words

Dad will not publish an app under his own personal name. Publishing waits for an LLC. The LLC only gets formed **once the app is finished**, and at that point the app moves to the LLC's account so it publishes under the LLC rather than under a person.

So the sequence is: **finish the app first, form the LLC second, publish third.**

This is not a business yet and will not be for a long time. Treat revenue, subscriptions and App Store submission as far-future concerns, not near-term work.

## What this means in practice

**Anything requiring dad has to be scheduled with him.** It is not blocked forever, it just cannot happen spontaneously. Batch those steps so he is only interrupted once.

**Do not suggest publishing, TestFlight, or App Store submission** as a next step. Nothing ships until there is an LLC, and there is no LLC until the app is done.

**Do not suggest setting up RevenueCat, subscriptions, or App Store Connect products.** Explicitly deprioritised. `05-revenuecat.md` exists for later and should be skipped entirely for now.

**Do not suggest Aria buy their own $99 membership** as a workaround without saying plainly that it is a real cost and that dad already has one.

## The correction that matters most

An earlier version of these docs said the Family Controls **Development** capability was "free and instant" and therefore the app lock could be tested without dad. **That was wrong, and it caused real confusion when the Mac asked for App IDs and an EAS login.**

Here is the accurate version:

- The **Development** capability needs no *approval* from Apple. That part was right: no form, no waiting, it just appears.
- But it is **only available to a paid Apple Developer Program team.** Apple's free "Personal Team" provisioning does **not** support Family Controls at all. It is not in the supported-capabilities list, and there is no way around that.

So **testing the real app lock on a physical iPhone requires dad's paid account.** There is no free path to it. What "free and instant" actually meant was "no approval wait", not "no paid membership".

The separate thing that *does* take days to weeks is the **Distribution** entitlement, which is only needed to ship. Given the plan above, that is not needed for a long time.

## What can genuinely be done alone

Quite a lot, and this is the honest line:

- The whole app **except the native lock**: tasks, the scheduler, the calendar, projects, breakdown, notifications, sign-in, sync. All of it runs on web and in Expo Go with no Apple involvement.
- **All of `02-supabase.md`** except Apple sign-in.
- **All of `03-mac-setup.md`**. Getting the Mac ready needs a Mac and free Xcode, not a developer account.
- **Most of `04-test-the-lock.md`**: flipping native on, `npm run typecheck:native`, and `npx expo prebuild`. Everything up to the point where a build has to be *signed*.
- **Compiling all the Swift**, which is better news than it sounds. Step 5b of `04-test-the-lock.md` builds the whole native module unsigned for the Simulator with **no Apple account and no EAS quota**. Every Swift compile error a cloud build would report shows up there instead, in a few minutes rather than 10 to 20. On its first ever run it caught two real bugs that would each have failed a cloud build. Run it before every `eas build`.

  This is the sharpest line in the whole setup: **compiling the Swift needs nobody. Running the lock needs dad.** Compiling proves the code is correct; only a real device with Family Controls proves the lock actually works.

What needs dad, and only this:

- Registering the four App IDs and enabling Family Controls on them
- Apple authentication for code signing. **Not** "being added to his team", that is impossible on an individual membership (`01-apple.md` Part 3). Either he sits in on every first-time signing step, or he generates one App Store Connect **Team API key** and hands it over, which removes him from the loop permanently. Generate the key.
- Later, far later: the Distribution entitlement, and the LLC conversion

Note what is **not** on that list: `eas login` and `eas init`. Those use a free **Expo** account, which has nothing to do with Apple and needs nobody.

## The open question to ask Apple, not to guess

When the LLC eventually exists, the recommendation in `01-apple.md` is to **convert dad's existing individual membership into an Organization membership** rather than transfer the app to a separate new account. Same account, same App IDs, nothing moves.

**What is genuinely undocumented:** whether an already-granted Family Controls entitlement survives that conversion. Apple has left forum questions about entitlements surviving app transfers unanswered for over a year. Nobody should assert an answer here. Ask Apple Developer Support directly before relying on it.

Since the entitlement request will not happen until much closer to shipping anyway, this is a question for later, not now.

## The one-line summary for any future session

Aria builds alone on Windows and a Mac. Dad has the paid Apple account and is a scheduled dependency, not an always-available one. There is no LLC and no business yet. The app lock cannot be tested without dad's account, because Family Controls does not work on a free Apple team. Nothing ships until the app is finished and an LLC exists.
