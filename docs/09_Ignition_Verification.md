# Ampora — Technical Spec: Ignition Verification

> How Ampora decides that a task was actually started or finished, which is what gates the unlock. Companion to `06_Technical_Spec_App_Blocking.md` (the OS shielding) and `01_PRD.md` Section 14. This is the most important integrity question in the app, so it starts with the honest version of the problem. No em dashes, no semicolons.

---

## 1. The honest problem

A commitment device only works if defeating it has friction. The unlock condition is "I finished the task", but no app can truly know whether you did the work unless it can see your screen or your output. If unlocking is just a button that says "done", the whole mechanic is hollow, you tap it and get Instagram back without doing anything.

So the design is not "build a perfect lie detector". It is "offer a spectrum of proof, from honor to real evidence, and let the user pick how much they need to keep themselves honest". Two things make this work even though it is not foolproof:

1. **The user is the beneficiary of their own honesty.** This is self-imposed, not imposed by a parent or teacher you would want to beat. People who set a stake want the structure, so even light proof helps.
2. **Friction beats faking.** Producing a photo of work you did not do, or sitting through a focus timer, is more effort than just doing the task. The proof does not need to be unbeatable, it needs to make doing the task the path of least resistance.

The strongest reliable automatic signal is time spent in a focus session inside Ampora, because the app controls its own timer. Photo and screenshot proof (your idea) sit on top of that as a self-honesty layer with a deliberately lenient AI check. Below is the full spectrum.

---

## 2. The verification spectrum (the user picks per stake)

Each method is a `verificationMethod` on the stake. They go from least to most friction. The app suggests a default and the Learning Engine can nudge the strength, but the user always chooses and can move down at any time.

### Tier 0 — Honor ("I did it")
No proof. The friction is purely self-honesty. The floor option, fine for users who genuinely want the structure. Always available.

### Tier 1 — Focus-time (app-verified, automatic, the recommended backbone)
The stake unlocks only after the user completes a focus session of a required length inside Ampora (default = the scheduled block length, or a set number of minutes). The app controls its own timer, so this is genuinely verifiable with no AI and no photos. To prevent gaming, the focus session also checks that Ampora stayed foregrounded and the screen stayed on for the session (backgrounding pauses the timer).
- Honest caveat: this verifies time-on-task, not output. You could sit and stare. But for procrastination, getting someone to sit down for 25 minutes is most of the battle, so this is the recommended default.

### Tier 2 — Proof-of-output: photo or screenshot (your idea, with a lenient AI check)
The user submits evidence of completed work:
- **Photo:** a finished worksheet, a page of notes, a whiteboard, the physical thing done.
- **Screenshot:** for phone tasks, a submitted-assignment confirmation, a Google Doc with text, a word count, a sent email.
A vision model does a plausibility check, not a strict grade: "does this image plausibly relate to {task}?" It is deliberately lenient and accepts unless the image is clearly unrelated, because a false rejection on someone's real work is the worst possible outcome for this audience (shame, frustration, churn). The image is saved to a private Proof Log the user can look back on (a record of work done, which is also motivating).
- Honest framing in the UI and to the user: the AI is a soft deterrent and a self-honesty aid, not a foolproof judge. It works mainly because faking a photo of real work is more effort than doing the work.

### Tier 3 — Word-count / artifact (for writing, exact)
If the user writes in Ampora's own editor or pastes their text, the app checks a word-count threshold ("write 300 words"). Exact and automatic for writing tasks.

### Tier 4 — Screen-aware (desktop companion or accessibility, strongest automatic)
The app observes that the user was actually in the right app (Docs, an IDE, a PDF reader) for the focus duration. This is the strongest automatic proof of real work, and it is the clear purpose of the optional screen-aware feature (P3). It is consensual self-monitoring, visible only to the user, reported to no one. Requires the companion or accessibility permissions, so it is opt-in and later-stage.

---

## 3. Start verification vs completion verification

These are different and use different methods.

### 3.1 Start (for "Beat the clock" and "Lock until I start")
Start is not "tap a button". Start = completing the First move (the 2 to 5 minute concrete action), which is a tiny real action (write one sentence, open the doc and type the title). So "did you start within 5 minutes" means "did you complete the First move within 5 minutes", checked off in-app.
- For start, honor-level proof of the First move is usually enough, because the First move is so small and concrete that doing it is easier than faking it, and the goal is momentum. The real proof effort is reserved for completion.
- In Beat the clock, if the First move is not completed within the timer, the stake apps lock for the bounded cooldown (PRD 14.3), governed by the wellbeing caps.

### 3.2 Completion (for "Lock until done")
Completion uses the chosen `verificationMethod` from Section 2 (honor, focus-time, photo/screenshot, word-count, or screen-activity). The completion condition can be the whole task or a specific subtask (PRD Section 14, doc 07 Part 3.10), so a user can lock until "outline done", verified by whichever method they chose.

---

## 4. The unlock flow (exact)

```
when the completion condition is reached (user taps "I'm done", or the timer elapses):
  switch verificationMethod:
    honor:          unlock
    focus_time:     if requiredFocusMin completed -> unlock
                    else -> "Keep going, X minutes left" (do not unlock)
    photo | screenshot:
                    prompt for the image
                    run lenient AI plausibility check
                    if plausible -> save to Proof Log, unlock
                    if not -> gentle message + retry, OR "Unlock anyway" override (logged)
    word_count:     if threshold met -> unlock, else show remaining
    screen_activity: if companion record satisfies the requirement -> unlock
  ALWAYS, regardless of method: the panic valve "Unlock early" (60s friction) is available
  on unlock: endStake(completed); remove the shield (doc 06)
```

Taking a photo (Camera) and taking a screenshot (OS) are never blocked (they are on the never-lock list), and uploading happens inside Ampora, so the user can always produce proof while their leisure apps are shielded. No conflict.

---

## 5. Wellbeing: verification never traps (non-negotiable)

This is the rejection-sensitivity population, and a verification that traps someone who did their work is the fastest way to make them quit and feel ashamed. Therefore:
- Every method has the panic valve (60s) and, for photo/screenshot, a manual "Unlock anyway" override. The override logs the event (so the user can see their own pattern) but never leaves them stuck.
- The AI plausibility check is lenient by design and errs toward accepting. A false rejection is treated as a worse failure than a false accept.
- Repeated overrides or panic-valve use trigger the same de-escalation as PRD 14.4 and 9.10 (lower strength, suggest a break, offer to pause stakes for the day). The app never responds to a struggling user by demanding more proof.
- No shame copy on any failed or overridden verification.

---

## 6. Calibration tie-in

The Learning Engine's ignition point can suggest a verification strength: light users default to honor or focus-time, and users who frequently panic-valve or self-report that honor mode is too easy to cheat get nudged toward photo or screen-aware proof. The user always chooses, and the app never forces verification up. The default for a new user is focus-time (automatic, real, low-friction), with honor available immediately and photo/screenshot offered as "make it harder to fool yourself".

---

## 7. Data model additions

Extend `StakeSession` (PRD Section 4):
```ts
verificationMethod: 'honor' | 'focus_time' | 'photo' | 'screenshot' | 'word_count' | 'screen_activity';
requiredFocusMin?: number;        // for focus_time
wordCountTarget?: number;         // for word_count
proofUri?: string;                // saved image for photo/screenshot (private Proof Log)
verificationResult?: 'passed' | 'overridden' | 'failed';
```
A `ProofLogEntry` records each submitted proof (image, timestamp, task, result) for the user's private history.

---

## 8. Summary (the straight answer)

- The app cannot truly know you did the work, so verification is a spectrum, not a lie detector.
- The reliable automatic backbone is focus-time inside Ampora (the app watches its own timer).
- Your photo and screenshot idea is the proof-of-output layer on top, with an AI plausibility check that is intentionally lenient and a private Proof Log.
- Starting is verified by completing the tiny First move, which is easier to do than to fake.
- The strongest automatic proof is the optional screen-aware tier (it sees you were in the right app), opt-in and later-stage.
- Nothing ever traps the user. Panic valve and override always exist, the AI errs toward accepting, and struggle triggers de-escalation, not more demands.
