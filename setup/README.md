# Ampora setup

This folder is the complete, current set of operational instructions for everything Ampora needs outside of just editing code: the Apple account and the app-locking entitlement, the Supabase backend, a Mac dev environment, building and testing the real iOS lock on a phone, and real subscriptions. It replaces the old root-level `MACBOOK_HANDOFF.md` and the scattered chat instructions it came from, all in one place.

Written for someone who has never done any of this before. If a step says "click X," it means click the literal button named X. Where something might have moved since this was written (dashboards change over time), that is called out rather than stated as certain.

## What can be done alone, today, with no Apple account

Most of it. The app itself does not need Apple for anything until it is time to build for a real iPhone.

- **`02b-browser-setup-prompt.md`** and the non-Apple half of **`02-supabase.md`**: the database, the redirect URL, Google sign-in, and the two `.env` keys. No Apple account involved at any point.
- **`03-mac-setup.md`**: getting a Mac ready. No Apple Developer account needed, just a Mac and the free Xcode.
- **`04-test-the-lock.md`**: this is the one that eventually needs a developer account to sign a build for a phone. Everything up to that signing step can be done alone.
- **`05-revenuecat.md`**: skip it. It only matters when there is a business taking money, which is not now.

Two things in `01-apple.md` need someone else and take real calendar time, so start them whenever that person is available. Nothing above waits on them.

## The two slow ones, whenever you get to them

Two things in here take real calendar time and mostly just sit and wait once started. Everything else can happen in an afternoon.

1. **The Family Controls (Distribution) entitlement request** (Apple). Days to a few weeks. This is what lets Ampora actually lock apps in a real, distributed build. See `01-apple.md`.
2. **A D-U-N-S number** (Dun & Bradstreet), only needed once you convert the Apple account to an Organization for the future LLC. About 1-2 weeks. Also in `01-apple.md`.

Neither blocks building, testing, or working on the app today. Native locking and real subscriptions are both off by default (feature flags), and the app runs fine without them while these two wait in the background.

## Order to do things in

| Order | File | What it's for | Start when | Typical wait |
|---|---|---|---|---|
| 1 | `01-apple.md` | Apple Developer account, the Family Controls entitlement, who legally owns the account | Today | Days to weeks |
| 2 | `02-supabase.md` | The database, sign-in, AI, env keys | Today, alongside 1 | Under an hour of clicking, plus occasional waiting on a paused project |
| 3 | `03-mac-setup.md` | Getting a Mac ready to build iOS at all | Whenever a Mac is available | 30-60 minutes |
| 4 | `04-test-the-lock.md` | Building the real app lock and testing it on a real iPhone | After 1 (the free Development capability, not the Distribution approval) and 3 are done | An afternoon |
| 5 | `05-revenuecat.md` | Real subscriptions instead of the placeholder paywall | **Not yet.** Skip until there is a business to take money for | An afternoon, whenever |

Read them in that order the first time. After that, each one stands alone, come back to whichever one is needed.

## Why this order

`01` and `02` both have steps that take real calendar time once submitted, so starting them first means the waiting happens in the background while everything else gets done. `03` has no dependencies, do it whenever a Mac is available. `04` is the one that actually proves the lock works on a phone: it needs a Mac (`03`) and, at minimum, the free and instant Development capability from `01` (not the full Distribution approval, that only matters once ready to ship to TestFlight or the App Store). `05` is genuinely last: it needs a paid Apple Developer account to even create a subscription product, and nothing else in the app depends on it working yet.

## What "done" looks like without any of this

Right now, on Windows, the app already works: it typechecks, the tests pass, and it runs in a browser. None of that needs anything in this folder. This folder is what turns on the two things that need real Apple infrastructure: the actual OS-level app lock, and real subscription payments. Both are quarantined behind feature flags that ship off on every shared branch (`native/README.md`), so nothing here is required to keep working on the rest of the app.

## The files

- **`01-apple.md`**: the Apple Developer account, the Family Controls entitlement (Development vs Distribution), and the honest answer to "should this be under the parent's account or an LLC."
- **`02-supabase.md`**: the database, running migrations, where the `.env` keys come from, turning on Google and Apple sign-in, deploying the AI functions.
- **`02b-browser-setup-prompt.md`**: a shortcut for most of `02`. A paste-able prompt for the Claude Chrome extension that wakes the project, adds the redirect URL, turns on Google sign-in, and hands back the two `.env` values. Read its warning about which keys are safe to share first, because they are not all the same. Use `02` directly if you would rather click through it yourself.
- **`03-mac-setup.md`**: the one-time Mac setup, including the paste-able Claude Code prompt and the one manual file copy that can't be automated.
- **`04-test-the-lock.md`**: building a real dev client and proving the app lock actually works on a real iPhone. The most concrete file here, read it end to end before starting.
- **`05-revenuecat.md`**: turning on real subscriptions, and the one exact-string mistake that silently takes people's money without unlocking the app.
