# Session record, 2026-08-07: Apple setup, EAS path, and a design audit that aged badly

What one long Claude Code session did, decided, and got wrong. Written so the context survives the chat window.

**The Apple portal half of this session is NOT repeated here.** It has its own exhaustive file: `setup/01b-apple-session-log.md`. Read that for anything about identifiers, entitlements, or the App Store Connect key. This file covers everything else.

## 1. What landed in git

Three PRs, all merged to `main`:

| PR | What |
|---|---|
| #8 | Recorded the Apple setup as done, corrected Part 4 of the parent walkthrough |
| #10 | Added `setup/01b-apple-session-log.md`, plus the `04-test-the-lock.md` Mac correction |
| #11 | Fixed the last stale "four permission requests" claim in the parent letter |

**One process note worth keeping.** Midway through, `origin/main` had moved. Commits on the local `fix/family-controls-entitlement-keys` branch had already landed on `main` through PRs #4 and #6 under different SHAs, so a local merge was silently duplicating work. The fix was to rebuild on top of current `origin/main` and cherry-pick only the genuinely new commit, rather than force-pushing over four commits that came from elsewhere. **Always `git fetch` and compare both directions (`main..origin/main` and `origin/main..main`) before merging a long-lived branch here.** This repo gets commits from more than one place.

## 2. Getting the app onto a real iPhone, from Windows

The full step-by-step now lives in `setup/04-test-the-lock.md`. The findings that put it there:

- **No Mac is needed to install on the phone.** `eas build` compiles on Expo's cloud macOS machines. `development-native` is `distribution: internal`, so the finished build installs over the air from a link opened in Safari on the iPhone. The Mac-only steps in `04` are optimisations, not requirements.
- **No flag flipping is needed for a cloud build.** Leave `native.config.json` all-false. The `-native` EAS profiles set `AMPORA_NATIVE=1` in the cloud environment, which `constants/nativeFlags.js` reads ahead of the file.
- **`eas device:create` must run before the build.** Skip it and the build completes normally, then silently refuses to install. This step was missing from the docs entirely.
- **The App Store Connect Team Key removes every Apple sign-in prompt.** Export `EXPO_ASC_API_KEY_PATH`, `EXPO_ASC_KEY_ID`, `EXPO_ASC_ISSUER_ID` and EAS manages certificates and profiles non-interactively.
- **`eas login` is the one step an agent cannot do.** It needs the account password.

## 3. A design audit, and why it was wrong within the session

Aria opened the app, said it still looked like a task-breakdown app with the locking feature nowhere to be found, and asked what happened to the redesign. An audit was run and reported these findings:

- the Stack redesign had only landed its token layer, with screen structure never applied
- `StakeSetupSheet` was reachable from just two places, neither of them the Focus tab
- the Focus tab was a task launcher headed "One thing at a time", with no mention of locking
- the Focus tab was built in green while the rest of the app was blue

**Most of that was already out of date when it was written.** The audit read an older working tree. By the time it was checked against committed `HEAD`, `e603615` and `1c3fe94` had landed the Stack screen restructure and the lock-first Focus tab. `app/(tabs)/focus.tsx` now opens with "The tab IS the lock, not a launcher into it" and hosts the tab's single `StakeSetupSheet`.

**The lesson, which is the reason this section exists:** in this repo, verify against `git show HEAD:<path>` rather than the working tree before reporting on product state. The working tree here regularly carries in-progress work from other sessions, and the checkout can lag what has actually been merged. An audit that reads the wrong tree produces confident, wrong, and demoralising conclusions.

### What from that audit is still true

- **Colour literals are not down to three.** Measured at `HEAD` on 2026-08-07: **166 matches across 33 files** under `app/`, `components/`, `hooks/`. `docs/design/README.md` and `NEXT_SESSION_PROMPT.md` had both already been corrected to roughly this figure by someone else, so no change was needed. The migration is ongoing. Do not add more, and re-run the sweep rather than trusting any number written down, including this one.
- **The Focus tab still leans green** (`#166534`, `#22C55E`, `#15803D` in the pre-restructure version). Worth a check against the blue/green ruling in `docs/02_Design_System.md` section 14.7, which reserves green for terminal states and gives blue to about-to-do and doing.

## 4. The one real gap this session found

**`docs/design/DECISION_SPEC.md` does not exist, and 11 source files cite it 16 times.**

Referencing it today:

```
app/(tabs)/focus.tsx            app/(tabs)/index.tsx
app/focus/session.tsx           components/focus/FocusHeroCard.tsx
components/focus/FocusTaskRow.tsx      components/focus/ScheduledStakeRow.tsx
components/focus/SessionControls.tsx   components/focus/SessionTimer.tsx
components/focus/StepCard.tsx          components/home/TodayFocusCard.tsx
components/stakes/LockBanner.tsx
```

Comments point at specific numbered decisions in it, for example `doc design/DECISION_SPEC D1` and `D4 item 8`. `app/(tabs)/index.tsx` cites a `DESIGN_DECISION_SPEC.md` under a slightly different name. Neither file is in the repo.

This is precisely the failure `docs/design/README.md` already warns about, in the note explaining why `stack-reference.html` had to be committed: a design artefact that lived only in a chat session, which no later session can see. The lesson was applied to the HTML reference and then not applied to the decision spec.

**Whoever holds that document should commit it to `docs/design/DECISION_SPEC.md`.** Until then, every comment citing D1 or D4 is unresolvable, and nobody can check the Focus and session screens against the decisions they were built to. This session could not write it, because the content only ever existed in a different conversation.

## 5. State at the end of this session

- `main` carries all three PRs above, plus later work from elsewhere (`e603615`, `1c3fe94`, `9b85b1a`, `51fc765`).
- Everything Apple is finished. Nothing there is blocked on Aria's dad any more.
- The phone build is blocked only on `npx eas-cli@latest login`.
- `docs/design/DECISION_SPEC.md` is missing and should be committed by whoever has it.
