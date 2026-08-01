# Ampora setup

This folder is the complete, current set of operational instructions for everything Ampora needs outside of just editing code: the Apple account and the app-locking entitlement, the Supabase backend, a Mac dev environment, building and testing the real iOS lock on a phone, and real subscriptions. It replaces the old root-level `MACBOOK_HANDOFF.md` and the scattered chat instructions it came from, all in one place.

Written for someone who has never done any of this before. If a step says "click X," it means click the literal button named X. Where something might have moved since this was written (dashboards change over time), that is called out rather than stated as certain.

## What can be done alone, today

Most of it. Nothing needs Apple until it is time to build for a real iPhone, and only that last step does.

**Read `00-my-situation.md` first.** It records who holds which account and what the plan is, so nothing here has to be re-explained.

- **`02b-browser-setup-prompt.md`** and the non-Apple half of **`02-supabase.md`**: the database, the redirect URL, Google sign-in, and the two `.env` keys. No Apple account involved at any point.
- **`03-mac-setup.md`**: getting a Mac ready. No Apple Developer account needed, just a Mac and the free Xcode.
- **`04-test-the-lock.md`**: everything up to *signing a build* can be done alone. The signing step itself needs the paid Apple account, because Family Controls does not work on a free Apple team at all. See `00-my-situation.md`.
- **`05-revenuecat.md`**: skip it. It only matters when there is a business taking money, which is not now.

Testing the real lock on a phone needs the parent's paid Apple account, because Family Controls does not work on a free Apple team at all. Batch those steps so he is only interrupted once. Nothing above waits on him.

## The two slow ones, whenever you get to them

Two things in here take real calendar time and mostly just sit and wait once started. Everything else can happen in an afternoon.

1. **The Family Controls (Distribution) entitlement request** (Apple). Days to a few weeks. This is what lets Ampora actually lock apps in a real, distributed build. See `01-apple.md`.
2. **A D-U-N-S number** (Dun & Bradstreet), only needed once you convert the Apple account to an Organization for the future LLC. About 1-2 weeks. Also in `01-apple.md`.

Neither blocks building, testing, or working on the app today. Native locking and real subscriptions are both off by default (feature flags), and the app runs fine without them while these two wait in the background.

## Order to do things in

| Order | File | What it's for | Start when | Typical wait |
|---|---|---|---|---|
| 1 | `01-apple.md` | Apple Developer account, the Family Controls entitlement, who legally owns the account | Whenever the account holder is available | Days to weeks |
| 2 | `02-supabase.md` | The database, sign-in, AI, env keys | Today, alongside 1 | Under an hour of clicking, plus occasional waiting on a paused project |
| 3 | `03-mac-setup.md` | Getting a Mac ready to build iOS at all | Whenever a Mac is available | 30-60 minutes |
| 4 | `04-test-the-lock.md` | Building the real app lock and testing it on a real iPhone | After 3, and after the App IDs from 1 exist on the paid account | An afternoon |
| 5 | `05-revenuecat.md` | Real subscriptions instead of the placeholder paywall | **Not yet.** Skip until there is a business to take money for | An afternoon, whenever |

Read them in that order the first time. After that, each one stands alone, come back to whichever one is needed.

## Why this order

`02` and `03` need nobody else, so do them first and in any order. `01` needs the account holder, so it happens when he is available. `04` is the one that proves the lock works on a phone: it needs a Mac (`03`) and the four App IDs registered on the paid account (`01`). The Development capability there needs no Apple approval, but it does need that paid team, which is the part an earlier version of these docs got wrong. `05` is genuinely last and should be skipped for now: there is no business yet.

## What "done" looks like without any of this

Right now, on Windows, the app already works: it typechecks, the tests pass, and it runs in a browser. None of that needs anything in this folder. This folder is what turns on the two things that need real Apple infrastructure: the actual OS-level app lock, and real subscription payments. Both are quarantined behind feature flags that ship off on every shared branch (`native/README.md`), so nothing here is required to keep working on the rest of the app.

## The files

- **`00-my-situation.md`**: the standing context on accounts, money and who owns what. Read it first. Any instruction anywhere that conflicts with it is wrong.
- **`01-apple.md`**: the Apple Developer account, the Family Controls entitlement (Development vs Distribution), and the honest answer to "should this be under the parent's account or an LLC."
- **`02-supabase.md`**: the database, running migrations, where the `.env` keys come from, turning on Google and Apple sign-in, deploying the AI functions.
- **`02b-browser-setup-prompt.md`**: a shortcut for most of `02`. A paste-able prompt for the Claude Chrome extension that wakes the project, adds the redirect URL, turns on Google sign-in, and hands back the two `.env` values. Read its warning about which keys are safe to share first, because they are not all the same. Use `02` directly if you would rather click through it yourself.
- **`03-mac-setup.md`**: the one-time Mac setup, including the paste-able Claude Code prompt and the one manual file copy that can't be automated.
- **`04-test-the-lock.md`**: building a real dev client and proving the app lock actually works on a real iPhone. The most concrete file here, read it end to end before starting.
- **`05-revenuecat.md`**: turning on real subscriptions, and the one exact-string mistake that silently takes people's money without unlocking the app.
