# Ampora — Ignition: Sessions and Verification

> The session model behind the lock, and how Ampora decides a stake is satisfied. Companion to `05_App_Blocking_Technical.md` (the OS shielding) and `01_PRD.md` Section 7 (FR-40 to FR-78). This is the integrity core of the app, so it starts with the honest version of the problem. No em dashes, no semicolons.

---

## 1. The session is the unit

A stake does not lock "until you start" and it does not lock "until the whole task is done". It locks for a **focus session**. This one decision resolves the two failure modes of the obvious designs:

- **Lock-until-start leaks.** If doing the First move unlocks your apps, you do the 2-minute move, get Instagram back, and never actually work. The start was faked into an unlock.
- **Lock-until-done traps.** A real task runs 1 to 3 hours. That exceeds the 180-minute daily wellbeing cap on its own and blows past any single lock a lenient photo check could honestly police. Locking for hours turns the app into a punishment device.

The session hold sits between them. Apps lock for a bounded block (default 45 minutes, tunable 15 to 50). Serving the block is what unlocks, so you cannot start-then-bail, and the block is short enough to stay well under the wellbeing caps. The First move still appears, but as the on-ramp inside the session, not as the thing that ends the lock.

## 2. The two holds

**Hold = `session` (default).** Apps lock for the session length. Unlock is by focus-time served (Section 4). Use for anything: "hold my apps while I work on this."

**Hold = `until_done` (opt-in, short tasks only).** Apps lock until completion is verified by photo or screenshot. Only offered when the task or subtask estimate fits inside one session under the wellbeing cap, so it is reserved for short concrete things ("empty the dishwasher", "submit the form"). If the single-session cap is reached before completion, the lock converts to a normal session release. Wellbeing always wins over the stricter condition. Never offered against a whole project.

## 3. The honest problem with proof

A commitment device only works if defeating it has friction. But no app can truly know whether you did the work unless it can see your screen or your output. So the design is not "build a perfect lie detector". It is "make the honest path the path of least resistance", and two facts make that work even though it is not foolproof:

1. **The user is the beneficiary of their own honesty.** This is self-imposed, not imposed by a parent or teacher you would want to beat. People who set a stake want the structure, so even light proof helps.
2. **Friction beats faking.** Serving a focus timer, or producing a photo of work you did not do, is more effort than just doing the task.

## 4. The verification spectrum (three tiers)

Each stake carries a `verification` method. The default for a new user is focus-time.

**Honor ("I did it").** No proof. The friction is purely self-honesty. The floor option, always available.

**Focus-time (automatic, the backbone, and the mechanism of the session hold).** The stake unlocks only after the required focus time is served inside Ampora. The app controls its own timer, so this is genuinely verifiable with no AI and no photos. To prevent gaming, the timer counts only while Ampora is foregrounded and the screen is on; backgrounding pauses it and returning resumes it. Honest caveat: this verifies time-on-task, not output. You could sit and stare. But for procrastination, getting someone to sit down for the session is most of the battle, which is exactly why it is the default.

**Photo or screenshot (proof-of-output, used by the `until_done` hold).** The user submits evidence: a finished worksheet or page of notes (photo), or a submitted-assignment confirmation, a document with text, a sent email (screenshot). A vision model runs a plausibility check, not a grade: "does this image plausibly relate to {task}?" It is deliberately lenient and accepts unless the image is clearly unrelated, because a false rejection on someone's real work is the worst possible outcome for this audience (shame, frustration, churn). The image is saved to a private Proof Log the user can look back on, which is also a motivating record of work done. The UI is honest that the AI is a soft deterrent and a self-honesty aid, not a foolproof judge.

Word-count and screen-activity verification are deferred (see `V2_Changes.md`). Three tiers is enough for launch and avoids choice overload for this audience.

## 5. The First move is the on-ramp, not the gate

The First move (the 2 to 5 minute concrete action) appears at the start of every session and is the unit shown in Blindfold. Completing it logs "started" for the time-to-start metric and reveals the next subtask. It does not unlock anything. In the session hold, the session timer unlocks; in until_done, verified completion unlocks. This is the anti-leak rule stated as UI behavior: doing the first move never ends the lock.

## 6. The unlock flow (exact)

```
session start (manual tap, or scheduled auto-arm at the cue / after the start window):
  if stake attached: applyShield (doc 05); log shield_on
  show the First move as the on-ramp
  start the foreground-only timer (pauses on background, resumes on foreground)

on the hold condition:
  hold = session:
    when the required focus time is served in the foreground:
      removeShield; log session_complete; show the end check-in (Done / Keep going / Stop here)
    if the user leaves early: timer pauses; apps stay locked; banner shows minutes remaining
  hold = until_done:
    when the user submits proof:
      run the lenient AI plausibility check
      if plausible -> save to Proof Log, removeShield, log completed
      if not -> gentle message + retry, OR "Unlock anyway" override (logged)
    if the single-session cap is reached first -> removeShield (session_served), log expired

ALWAYS, regardless of hold: the panic valve "Unlock early" (60s friction) is available
```

Taking a photo (Camera) and taking a screenshot (OS) are never blocked (they are on the never-lock list), and uploading happens inside Ampora, so the user can always produce proof while their leisure apps are shielded. No conflict.

## 7. Wellbeing: verification never traps (non-negotiable)

This is the rejection-sensitivity population, and a lock that traps someone who did their work is the fastest way to make them quit and feel ashamed. Therefore:

- Every hold has the panic valve (60s) and, for photo/screenshot, a manual "Unlock anyway" override. The override logs the event so the user can see their own pattern, but never leaves them stuck.
- The AI plausibility check is lenient by design and errs toward accepting. A false rejection is treated as worse than a false accept.
- Repeated overrides or panic-valve use trigger de-escalation (lower strength, suggest a break, offer to pause stakes for the day). The app never responds to a struggling user by demanding more proof.
- The single-session cap converts any `until_done` lock to a release, so a wrong estimate can never produce a marathon lock.
- Stake strength is a fixed sensible default plus a single user-set control. There is no automated strength calibration at launch.
- No shame copy on any failed or overridden verification.

## 8. Data model

The stake fields live on `StakeSession` (PRD Section 9.4):
```ts
hold: 'session' | 'until_done';
trigger: 'manual' | 'scheduled';
sessionMin?: number;                 // for hold='session', default 45, range 15..50
startWindowMin?: number;             // scheduled only: arm if not started within X of the cue
verification: 'honor' | 'focus_time' | 'photo' | 'screenshot';
strength: number;                    // 0..1, user-set
outcome?: 'completed' | 'panic_valve' | 'timed_out' | 'expired' | 'session_served';
```
A `Proof` row (PRD Section 9.4) records each submitted image (uri, timestamp, session, verdict, overridden) for the user's private Proof Log.

## 9. Summary (the straight answer)

- The lock unit is the focus session, which fixes the leak of lock-until-start and the trap of lock-until-done.
- The default hold unlocks on focus-time served; the app watches its own timer, so it is real without AI.
- The opt-in until_done hold unlocks on a lenient photo/screenshot check and is capped so it can never run long.
- The First move is the on-ramp and the Blindfold unit, never an unlock condition.
- Nothing ever traps the user. Panic valve and override always exist, the AI errs toward accepting, the cap converts long locks, and struggle triggers de-escalation, not more demands.
