# Ampora — V2 and Beyond (Deferred Scope)

> Everything on this list is deliberately OUT of the launch build. It is parked here so the launch docs stay clean and single-minded. Do not reference any of this in the other docs, the PRD, the design system, or the roadmap. When a feature here is revived, move it into the relevant doc and delete it from this file.
>
> Nothing here is "cancelled." It is sequenced. The launch product must earn retention first; these are the moat and the depth we add once real usage data exists.

## Why these were cut

The launch scope was trimmed to the smallest thing that is genuinely useful and genuinely differentiated: an auto-scheduling task app whose one special power is locking your own apps for a bounded work session. Everything that did not serve that core loop, or that demanded sustained user effort or months of data to pay off, was moved here. Feature depth that an ADHD user has to maintain by hand is the exact thing that gets abandoned, so we ship less on purpose and add depth against evidence.

---

## 1. The Learning Engine (all surfaces)

Cut in full for launch. The pivot line "schedules the real you" is a V2 promise, not a launch promise.

- **Focus DNA.** A stable personal insights screen with per-task-type estimation multipliers.
- **Revealed Self.** At schedule time, when stated start time and real start time diverge consistently, suggest rescheduling to the real slot.
- **Energy states.** Energy-aware placement and the energy-peak onboarding step. The onboarding step is removed with it.
- **Time-blindness estimation multipliers.** Soft padding of estimates based on your history of running short.

**Revive first:** the time-blindness multiplier. It is the cheapest high-value piece (a simple "your estimates run short, so I padded this by 1.5x") and time perception is a core, well-documented ADHD deficit. Bring it back as the first Learning Engine fragment once there is enough completion history to compute it.

**Depends on:** months of per-user BehavioralSignals (planned vs actual start, completion by hour and task type, lapse and recovery, stake outcomes). None of this is meaningful on day one.

## 2. Stake calibration by the Learning Engine

Cut. At launch, stake strength uses fixed sensible defaults plus a single manual strength setting the user controls. Auto-tuning strength within wellbeing caps returns when the Learning Engine returns.

## 3. Verification tiers: word-count and screen-activity

Cut. Launch keeps three tiers only: honor, focus-time (the automatic backbone), and photo/screenshot (lenient AI plus a private Proof Log). Word-count verification and the screen-activity or screen-aware tier are deferred. Five verification methods is choice overload for this audience; three is enough.

## 4. Breakdown memory

Cut. At launch the breakdown engine does not learn your granularity preferences or completion fidelity across tasks. Each breakdown is fresh (with the in-task Refine chat as the correction path). Personalized breakdown memory returns in V2.

## 5. Multi-modal source attachment

Cut. Launch supports simple source grounding only: paste text, or attach a single document, on a specific task. Multi-modal attachment (images, multiple files, rich sources) is deferred.

## 6. Projects: knowledge base, chat, and mastery tracking

The Projects TYPE ships (phases, a one-line context field, percent progress, nightly session generation). What is cut:

- **Project knowledge base (files).** No persistent per-project file store. For a session that needs real material, paste it on that day's task instead.
- **Project chat / AI assistant with ToolActions.** No conversational project agent. The in-task Refine chat covers "the AI got it wrong."
- **Study-project mastery and topic-coverage tracking.** Launch shows a simple percent bar only, not per-topic mastery.

**Revive first:** the project file store, since it is what most improves session-generation quality once people are retained on multi-day work.

## 7. Widgets and desktop companion

Cut. Phone and web only at launch. Home-screen widgets and a desktop companion app are deferred.

## 8. Focus as a separate concept

Note, not a feature cut: Focus is not a separate product surface layered on top of Ignition. There is one session concept. The Focus tab is where a session runs; a session may or may not carry a stake. This is reflected in the launch docs already and is listed here only so the distinction is not re-introduced as two systems.

---

## Sequencing note for whoever builds V2

Recommended revival order, each gated on real launch metrics (session completion rate, time-to-start, retention):

1. Time-blindness estimation multiplier (first Learning Engine fragment).
2. Project file store (biggest lift to multi-day session quality).
3. Full Focus DNA and Revealed Self.
4. Stake calibration.
5. Breakdown memory.
6. Remaining verification tiers, widgets, desktop, project chat and mastery.
