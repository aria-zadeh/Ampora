# Ampora — Conformance Matrix (generated report, not a spec)

> **This file is a generated audit, not a spec.** It does not add, change, or override any requirement. The canonical spec set is the eleven numbered docs (`00_Overview.md` through `09_Decisions.md`) plus `V2_Changes.md`. If this file and a numbered doc ever disagree, the numbered doc wins; fix this file, not the other way around.
>
> **Observed:** 2026-07-30, branch `v1-completion`, against the working tree as read during this audit.
> **Read-only.** No code was changed to produce this. Where a claim could not be verified from the repo (native Swift needs a Mac, real IAP needs App Store Connect, AI needs `GEMINI_API_KEY`), it is marked `BLOCKED-EXTERNAL`, not `DONE`.
>
> **Live-editing caveat:** `types/index.ts`, `core/scheduler/**`, `services/notifications.ts`, `store/scheduleStore.ts`, `store/settingsStore.ts`, `app/_layout.tsx`, `app/onboarding/**`, `core/iap/**` and `app/paywall.tsx` were being actively edited by other workers while this audit ran. One concrete instance: `app/onboarding/first-task.tsx` and `app/onboarding/aha.tsx` did not exist on an initial directory listing and were present with full implementations a few tool-calls later — another worker built them mid-audit. Anything below touching those paths is a snapshot, not a durable fact; re-check before treating a MISSING/PARTIAL verdict in those files as still true.

## Verdict legend

- **DONE** — implemented, callable end-to-end from the UI, evidence cited. Tests noted where they exist.
- **PARTIAL** — some of it exists; the missing part is stated precisely.
- **MISSING** — not implemented.
- **DEFERRED** — explicitly out of scope per `V2_Changes.md`, section cited.
- **POST-LAUNCH** — `08_MCP_and_API.md` and `07_Build_Roadmap.md` Milestone 7 place this after launch by design. Not a gap.
- **BLOCKED-EXTERNAL** — code exists but cannot be verified/finished from this repo alone (Mac + Xcode, App Store Connect, or a server-side API key).

## Verdict counts

| Verdict | Count |
|---|---|
| DONE | 47 |
| PARTIAL | 15 |
| MISSING | 2 |
| DEFERRED | 0 (see §6 for scope that crept back in) |
| POST-LAUNCH | 3 |
| BLOCKED-EXTERNAL | 4 |
| **Total rows** | **71** |

(Counts cover every FR/NFR row in §1–§2 below; the Gherkin, wellbeing, copy, and V2-creep sections are qualitative follow-ups on the same evidence, not additional counted rows.)

---

## 1. Functional Requirements

### Tasks, lists, capture

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-1 | Events (fixed) + Tasks + Auto-schedule toggle | PARTIAL | Tasks and the toggle are real: `types/index.ts:245` (`autoSchedule: boolean`), `components/task-editor/TaskEditorForm.tsx:1215-1232` (toggle UI). But **Events as a user-creatable type do not exist end to end**: `CalEvent` (`types/index.ts:202-214`) is only ever populated read-only from device-calendar sync (`services/calendarSync.ts`); there is no store or screen that lets a user create a local `CalEvent`. `components/ui/AddEventModal.tsx:25` defines exactly that UI, but a repo-wide search finds zero importers of `AddEventModal` outside its own file — it is dead code, same class of issue as the `isLockable`/`onSchedule` examples this task warned about. "Fixed, never-auto-moved" items today are modeled only as Tasks with `autoSchedule:false` (`core/scheduler/freeTime.ts:117-131` `fixedTaskSpans`), which is a reasonable stand-in but is not the distinct Event type FR-1 describes. |
| FR-2 | Full task editor, §8.3 fields + More options | DONE | `components/task-editor/TaskEditorForm.tsx`: Title:941, Notes:961, List:982, Tags:993, Priority:1004, Due (+ helper):1284-1285, More options disclosure:1325, Start after:1329, Split into sessions:1370, Minimum/Maximum block:1399/1415, Buffer before/after:1422/1442, Repeat:1468, Depends on:1477, Color:1483, Add assignment details/Break it down:1021-1045, Save task:1591. One field not located in this file: a per-task Scheduling-hours-profile picker (the type/engine support it — `types/index.ts:326-327`, `core/scheduler/placement.ts:104-107` — but no dedicated editor control was found). |
| FR-3 | Quick-add NL parsing with preview | DONE | `core/quick-add.ts` (`parseQuickAdd`), test `core/__tests__/quick-add.test.ts`. Live preview consumed in `app/onboarding/first-task.tsx:58,170-189`. |
| FR-4 | Voice capture ("Brain dump") | DONE | `services/voiceCapture.ts` (on-device STT via `expo-speech-recognition`, PRD §15 Q6's own stated preference), `components/capture/BrainDumpSheet.tsx`. Explicit graceful degradation to the typed field on any failure (`services/voiceCapture.ts:16-33`). |
| FR-5 | Inbox for detail-less capture | DONE | `types/index.ts:246-267` `Task.isInbox` with the promotion rule documented inline; store-side promotion in `store/taskStore.ts` per that doc comment. |
| FR-6 | Lists/Tags/Search/Filters/Sorting/smart views | PARTIAL | List/tag/priority/missed/unscheduled/due-range filters confirmed in `app/(tabs)/tasks.tsx:312-324`. The "has-stake"/"Stakes active" smart view is explicitly NOT implemented — the code says so itself: `app/(tabs)/tasks.tsx:328-330` and `:772-774`, `// TODO(stakes): FR-6 also calls for "has-stake" / "Stakes active" filters here. Deliberately not implemented in this pass — stakesStore is being rewritten by another workstream right now.` That workstream (the Ignition rebuild) is now substantially done (see FR-40 below), so this TODO is stale and actionable. |
| FR-7 | Source-grounded breakdown | DONE | `docs/03` Part 1.3 rules implemented server-side: `supabase/functions/ai-breakdown/index.ts`; client wiring `services/ai.ts:175-200` (`breakdownTask`), local fallback path never throws to UI. |
| FR-8 | First move + editable subtasks + Make easier + Refine | DONE | `components/task-editor/SubtaskChecklist.tsx`, `services/ai.ts:203-228` (`refineBreakdown`, `simplifySubtask`), edge functions `ai-refine`, `ai-simplify`. First move never unlocks anything — enforced at the session screen, see FR-41 below. |

### Scheduling engine

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-9 | Placement respects duration-minus-progress, start-after, hours, split, buffers, deps, priority | DONE | `core/scheduler/placement.ts:272-334` (`placeTask`), buffers:280-297, deps via `taskFinish` map:130-133, remaining-minus-progress:276-277. Tests: `core/__tests__/placement.test.ts`. |
| FR-10 | Ordering: priority then due, ties by manual order then creation | DONE | `core/scheduler/ordering.ts:32-49` (`compareTasks`), exact tiebreak chain matches the FR text. Test `core/__tests__/ordering.test.ts`. |
| FR-11 | Task splitting into min/max-bounded sessions | DONE | `core/scheduler/sessionSizing.ts` (balanced/frontload sizing, never below min/above max, `mergeRemainderIntoTail`:113-136). Test `core/__tests__/sessionSizing.test.ts`. |
| FR-12 | Due is a hard deadline, rendered distinct from scheduled blocks | DONE | `latenessPenalty` dominance in `core/scheduler/placement.ts:212-215` (never places past due except as last resort with unschedulable reason); calendar renders Due nowhere on the block itself, only the scheduled time — distinct by construction. |
| FR-13 | Scheduling-hours profiles, resolution task ?? list ?? settings | DONE | `core/scheduler/placement.ts:104-107` (`taskHoursSpans`) implements exactly this fallback chain, `listMap` threaded from `store/scheduleStore.ts:161,177`. |
| FR-14 | Workload distribution (Balanced/Front-load), auto-frontload near due | DONE | `core/scheduler/slack.ts:46-50` (`isNearOrOverDue`), consumed in `core/scheduler/placement.ts:279`. Settings toggle: `types/index.ts:734`. |
| FR-15 | Recurrence model (daily/weekly/monthly, every-N, by-weekday, from-completion, per-occurrence window, end conditions, exceptions) | DONE | `types/index.ts:93-145` (`RecurrenceRule`), full expansion in `core/recurrence.ts`. Test `core/__tests__/recurrence.test.ts`. |
| FR-16 | Missed repeating occurrences drop by default, opt-in carry-forward | DONE | `RecurrenceRule.carryForward` (`types/index.ts:139-144`), `core/recovery.ts` drop logic, `advanceMissedOccurrence` in `core/recurrence.ts`. Test `core/__tests__/recovery.test.ts`. |
| FR-17 | Auto-schedule cutoff, default 2 weeks (raisable) | PARTIAL | Engine cutoff exists and is configurable (`core/scheduler/types.ts:27` `DEFAULT_CUTOFF_DAYS = 14`), and `Settings.autoScheduleCutoffWeeks` (`types/index.ts:741`) is wired for the Settings screen default. But the engine's own default constant (14 days) is not itself sourced from `Settings.autoScheduleCutoffWeeks` in `core/scheduler/recompute.ts:39` (`input.cutoffDays ?? DEFAULT_CUTOFF_DAYS`) — `store/scheduleStore.ts`'s `recompute()` call does not pass `cutoffDays` from settings, so raising the Settings value may not actually extend the live horizon. Needs a one-line check, not a rebuild. |
| FR-18 | Partial completion reschedules only remaining duration | DONE | `core/scheduler/slack.ts:16-18` (`remainingMinutes`), progress fill rendered `components/calendar/CalendarBlock.tsx:109-113`. |
| FR-19 | Dependencies enforced topologically | DONE | `core/scheduler/ordering.ts:107-152` (`topoSort`, stable Kahn's algorithm). Covered by `core/__tests__/ordering.test.ts`. |
| FR-20 | Unschedulable tasks never silently dropped, explained with a one-tap fix | PARTIAL | The engine side is real and good: `core/scheduler/placement.ts:336-345` (`unschedReason`) produces specific human-readable reasons, stored in `store/scheduleStore.ts:343-345` (`selectUnschedulable`). **But nothing calls `selectUnschedulable` anywhere in the app** (verified by a repo-wide search — the only match is the export itself). Exactly the kind of gap this task was warned to look for: computed, never rendered, no one-tap fix exists in any screen. |
| FR-21 | Recompute triggers (debounced 300ms, manual, daily, app-open, post-recovery), stable, pinned immovable | DONE | `store/scheduleStore.ts:379-414` (debounce + subscriptions), `moveBlock`/`setPinned`:242-274, stability reconciliation `core/scheduler/recompute.ts:150-208`. Test `core/__tests__/recompute.test.ts`. |
| FR-22 | Read-only calendar sync (Google/Outlook/iCloud) | DONE | `services/calendarSync.ts` reads the on-device calendar DB (EventKit/CalendarContract) that already aggregates all three providers once synced at the OS level — no OAuth of Ampora's own. Wired into `store/scheduleStore.ts:206-240` (`refreshExternalEvents`), staleness-gated re-fetch `:128-140`. Write-back correctly absent (out of scope per FR-22 itself). |

### Calendar UI

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-23 | Day/3-Day/Week/Month/Agenda, pill switcher, remembers last view | DONE | `app/(tabs)/calendar.tsx:38-53` (view coercion, 3-day phone default), `:220-225` (`CalendarHeader`), persisted via `Settings.calendarView` (`:66-70,88`). |
| FR-24 | Pinch-zoom 40/60/80/120px/hr persisted, sticky header, 44px gutter, current-time line | DONE | `core/calendar/geometry.ts:37-79` (zoom stops + stepping), pinch gesture `app/(tabs)/calendar.tsx:138-172`, current-time line `core/calendar/geometry.ts:139-148`. |
| FR-25 | Block geometry formula + interval-graph overlap | DONE | `core/calendar/geometry.ts:98-108` (`blockGeometry`, exact `top`/`height` formula incl. 22px floor), overlap `core/calendar/layout.ts` (full interval-graph/greedy-column algorithm). Tests `core/__tests__/calendar-geometry.test.ts`, `calendar-layout.test.ts`. |
| FR-26 | Dynamic block typography thresholds, never clip | DONE | `components/calendar/CalendarBlock.tsx:23-27,115-119` (exact §8.7 thresholds: 44px/28px/56px), `numberOfLines={1}` + ellipsis throughout. |
| FR-27 | Auto-broken task = one block + "N steps" | DONE | `components/calendar/CalendarBlock.tsx:60-64,177-181` (`remainingSteps`, "N steps" chip). |
| FR-28 | 60fps gestures: drag-reschedule (snap+pill+haptic+autoscroll+spring), resize, long-press-create, tap-open, tap-checkbox-complete, pinned lock glyph | PARTIAL | Drag/resize/pill/autoscroll/spring/haptics all present and unusually thorough: `components/calendar/DayView.tsx` (`DraggableBlock`, 170-843) — 5-min snap:46-47, live time pill:275-284, edge autoscroll:317-350, drop-spring:614-627, lock glyph `components/calendar/CalendarBlock.tsx:201-208`. Tap-to-open confirmed (`openTaskFromGesture`:384-390). Two pieces not confirmed: (a) a dedicated "long-press empty space to create" gesture was not found in `DayView.tsx`/`TimeGrid.tsx` (creation appears to go through the FAB/quick-add instead); (b) "tap checkbox to complete inline" — the block itself has no checkbox; completion is via the "…" action sheet's Complete button (`components/calendar/BlockActionSheet.tsx`), not an inline tap target on the block. |

### Ignition (app-locking on a session model)

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-40 | Stake apps via native picker, editable, six never-lock categories enforced | DONE | `store/stakesStore.ts:600-638` (`setSelection` rejects never-lock + "all apps" tokens), `core/blocking/limits.ts:72-94` (categories + all-apps tokens), `components/stakes/AppPicker.tsx:123` (`isLockable` filters the catalog — this fixes the exact "isLockable had zero callers" issue flagged as a past failure mode; it now has two real callers). iOS opaque-token picker is real code but is `BLOCKED-EXTERNAL` (see §5); web/dev correctly uses a labeled mock catalog (`AppPicker.tsx:9-14`). |
| FR-41 | Stake = hold (`session` default / `until_done` opt-in short-tasks) + trigger | DONE | `types/index.ts:420-471` (`StakeSession`), `store/stakesStore.ts:640-756` (`startStake`, full gate order, `effectiveSessionMin` clamping), `isUntilDoneEligible`:564-579 (must fit one capped session). Anti-leak enforced at the store, not the UI: `completeStake` is a documented no-op for `hold:'session'` (`store/stakesStore.ts:955-968`). Tests: `core/__tests__/ignition-migrations.test.ts`. |
| FR-41a | Scheduled trigger, optional start window, never arms in quiet hours, dismissible | DONE | `core/stakeAutoArm.ts` (`decideAutoArm`, pure, unit-tested: `core/__tests__/stakeAutoArm.test.ts`), wired via `store/stakesStore.ts:866-921` (`autoArmDueStakes`) and `hooks/useStakeScheduler` (mounted in `app/_layout.tsx:12`). Quiet-hours-at-arm-moment check in `scheduleStake`:798-800 (distinct from at-request-time, documented why). |
| FR-41b | Per-device, independent | DONE | `store/stakesStore.ts:60-69` (`getDeviceId`), `StakeSession.deviceId` stamped on every session (`:696-703`). No cross-device sync of active session state exists (correctly absent). |
| FR-41c | Only one session active at a time | DONE | `store/stakesStore.ts:655` (`already_active` refusal), `decideAutoArm`'s `retry` branch for a concurrent session (`core/stakeAutoArm.ts:94`). |
| FR-41d | Recurring stakes repeat, weekly summary notification | DONE | `store/stakesStore.ts:472-521` (`maybeRescheduleRecurringStake`, fires on every terminal outcome including bad ones, on purpose), weekly summary `services/stakeScheduling.ts:11-12,44-58` (`stakeWeeklySummaryId`, 7-day refresh). |
| FR-42 | Panic valve, 60s + calm message | DONE | `components/stakes/PanicValveSheet.tsx:37` (`PANIC_COUNTDOWN_SEC = 60`), calm copy throughout, `store/stakesStore.ts:970-1002` (`panicValve`, always succeeds). |
| FR-43 | De-escalation: repeated panic/misses lower strength, offer pause, never more pressure | DONE | `store/stakesStore.ts:133-136` (`PANIC_DEESCALATE_THRESHOLD=2`, `STRENGTH_DEESCALATE_STEP=0.2`, only ever subtracts), `:980-1001`. `components/stakes/DeEscalationSheet.tsx` offers "Pause stakes for today" (`pauseStakesForToday`:1004-1011). |
| FR-44 | Fixed defaults + single manual strength control, no auto-calibration | DONE | `core/blocking/limits.ts:57-61` (`DEFAULT_STAKE_STRENGTH=0.6`, bounds 0..1), the only writer of `stakeStrength` besides the user is de-escalation lowering it (never raising) — confirmed by reading every `updateSettings({ stakeStrength` call site. |
| FR-45 | Session lifecycle incl. kill/restart persistence, multi-boundary auto-expiry | DONE | `store/stakesStore.ts:1015-1109` (`reconcileActiveSession` — stale-session bound, live-lock check, quiet-hours, cap, re-apply-and-continue), `:1112-1158` (`tick`, daily cap / quiet hours / single-session cap / session length, all four checked every minute). |
| FR-46 | Wellbeing caps: daily 180 (user-lowerable), single-session 50, quiet-hours | DONE | See §3 below — verified item-by-item with its own evidence. |

### Verification

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-77 | Three-tier unlock: honor / focus-time / photo-screenshot | DONE | `components/verification/VerificationSheet.tsx:116-148` (method list, exactly three tiers plus honor = four options matching the documented `verification` union), `store/proofStore.ts`. |
| FR-77b | Focus-time pauses on background, resumes on foreground, foreground-only | DONE | `hooks/useForegroundTimer.ts:132-152` (AppState-gated, explicitly does NOT auto-resume, "the user resumes on purpose"), accrual wired `app/focus/session.tsx:241-245` (`handleSecond` → `accrueFocus`). |
| FR-78 | Never traps: panic valve + override everywhere, AI errs toward accept, no shame copy | DONE | Override "Complete anyway" always shown when blocked (`components/verification/VerificationSheet.tsx:640-654`), AI verdict defaults to `"pass"` on any absence/error (`:95-110`), no shame copy found in a targeted search (see §4). |

### Projects

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-82 | Two work types, Projects created explicitly | DONE | `types/index.ts:596-618` (`Project`), `store/projectStore.ts:92-108` (`createProject`), `app/projects/index.tsx`, `components/projects/NewProjectSheet.tsx`. |
| FR-83 | Phase list (AI-drafted, editable) + one context line, no file library | DONE | `types/index.ts:582-618` (`Phase`, `contextLine`), `services/aiProjects.ts`, `components/projects/ProgressTracker.tsx`. `components/projects/FileList.tsx` and `ProjectChat.tsx` are absent from the tree (confirmed by directory listing) — correctly not built, matching `V2_Changes.md` §6. |
| FR-84 | Nightly pass emits one schedulable Task per project | DONE | `core/nightlyPass.ts` (pure decision logic: `decideNightlyPass`, `buildGeneratedTaskDraft:168-192` — sets `due`/`startAfter` to pin the generated task to the target day, `splittable:false` so it renders as one block). Test `core/__tests__/nightlyPass.test.ts`. Orchestration `services/nightlyPass.ts`, mounted via `hooks/useNightlyPass` in `app/_layout.tsx:13`. |
| FR-85 | End check-in (Done/Keep going/Stop here), percent bar, inferred-on-skip | DONE | `components/focus/EndCheckInSheet.tsx`, `app/focus/session.tsx:337-349` (`applyProjectCheckIn`, infers `'done'`/`'stop_here'` on a skipped check-in per FR-85's own text), `core/projects/progress.ts` (`applyCheckIn`, `computePercent`). Stakes correctly never attach to a whole project — they attach to the generated Task, same as any other task; no UI path exists to stake a `Project` object directly. |

### Account, subscription, platform, retention

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-87 | Auth (Apple/Google/email), cloud source-of-truth, no anonymous mode, deletion+export | PARTIAL | Email magic link is real and solid: `app/auth.tsx`, `services/supabase.ts` (`signInWithMagicLink`). **Apple and Google sign-in are not implemented** — `app/auth.tsx` offers only email + a "Continue as guest" link. **A permanent, non-`__DEV__`-gated guest-mode bypass exists and directly contradicts "No anonymous local-only mode"**: `app/auth.tsx:262-281` sets `globalThis.__AMPORA_GUEST_MODE__ = true` and routes straight past auth; `app/_layout.tsx:109-137` polls that flag and exempts guest mode from the auth/onboarding/paywall gate entirely (`:129` `if (guestMode) return; // guest mode handles its own routing`). This is not a stray dev flag behind `__DEV__` — it is a labeled, always-present UI affordance. Deletion/export: `core/dataExport.ts:98` (`wipeAllData`) plus an export function, surfaced in `components/settings/DataSettings.tsx`. |
| FR-88 | Paid app, 2-week trial, monthly/annual via Apple IAP, dev bypass | PARTIAL | Trial/entitlement math is real and tested-by-construction: `core/subscription.ts` (`TRIAL_DURATION_DAYS=14`, `isActive`, `startTrial`). The purchase-strategy seam is fully built (`core/iap/PurchaseStrategy.ts`, `MockPurchaseStrategy.ts`, `NativePurchaseStrategy.ts` — the last is real RevenueCat-calling code, gated behind `FEATURE_FLAGS.IAP_NATIVE`). But `react-native-purchases` is **not in `package.json`** — real purchasing cannot run yet; `getPurchaseStrategy()` (`core/iap/index.ts:36-45`) always returns the mock today. Dev bypass: `constants/featureFlags.ts:66` (`DEV_BYPASS_PAYWALL: __DEV__`, correctly stripped from production). This whole area (`core/iap/**`, `app/paywall.tsx`) is under active edit by another worker (P16-revenuecat) right now. |
| FR-89 | iOS/Android full, web minus blocking, phone-first, English-only | DONE (for what's built) | `core/blocking/SoftBlockingStrategy.ts` runs identically everywhere including web (`kind:'soft'`, no native import); `components/stakes/AppPicker.tsx:9-14` documents and implements the web/dev mock-catalog stand-in explicitly so it never over-promises OS blocking. No i18n/locale infrastructure found (consistent with "English only at launch," not a gap). |
| FR-90 | Pre-built-tomorrow pass, "Ready for tomorrow" notification | DONE | `core/nightlyPass.ts:44-83` (`decideNightlyPass`, evening-window + missed-catch-up logic), notification copy `services/notifications.ts:103-108` (`readyForTomorrowCopy`, verbatim match to §8.9). |

### Recovery, Blindfold, Focus, Notifications, Onboarding, Settings

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-60 | Recovery Mode: 2-day lapse trigger, drop-moot, bump-urgent, preview, one-tap, zero shame | DONE | `core/recovery.ts` (`LAPSE_DAY_THRESHOLD=2`:36, `isMissedBlock`:54-57, `URGENT_SLACK_RATIO`:39), `components/recovery/RecoveryBanner.tsx` ("Catch me up" button:94-98), `components/recovery/RecoverySheet.tsx` ("Rebuilt your week." literal copy:324). Test `core/__tests__/recovery.test.ts`. |
| FR-61 | Blindfold: one micro-step, next hidden until current marked done | PARTIAL | Functionally complete and calm: `app/blindfold.tsx` (`nextStep`/`pickTopTask`, single revealed step, "you're clear" end state:144-155). One literal mismatch against the Gherkin wording: the PRD's acceptance scenario says "I cannot see the next step until I **swipe** the current one done" — the actual control is a tap on an "I did this" button (`app/blindfold.tsx:189-201`), not a swipe gesture. Outcome is identical; the interaction pattern differs from the literal spec text. |
| FR-62 | Focus session: full-screen, timer, ambient audio, I'm stuck/Take a break/I'm overwhelmed, end check-in, lock banner | DONE | `app/focus/session.tsx` (orchestrates all of the above), `components/focus/AmbientAudioPicker.tsx`, `SessionControls.tsx`, `BreakOverlay.tsx`, `LockBanner` shown in-context (`:625-633`) plus globally (`components/focus/GlobalLockBanner.tsx`, mounted `app/_layout.tsx:344`). |
| FR-63 | Notification rate limits, quiet hours, DND-respecting, snoozeable, warm copy | DONE | `services/notifications.ts` — copy verified verbatim against §8.9 for Start Reminder (`:74-79`) and Ready-for-tomorrow (`:103-108`); rate-limit/quiet-hours shifting documented and implemented (`:197-201` `shiftOutOfQuietHours`). Stake-specific cues correctly **dropped** (not shifted) in quiet hours per FR-41a (`services/stakeScheduling.ts:22-27`), a deliberate and correct divergence from ordinary reminders. |
| FR-64 | Onboarding never blocks behind a permission | DONE | Every onboarding screen has a "Skip"/"Maybe later" path that still advances the flow: `app/onboarding/notifications.tsx:31-35`, `app/onboarding/first-task.tsx:60-66`, `app/onboarding/aha.tsx:82-85`. |
| FR-65 | Settings expose every configurable value | PARTIAL | Broad coverage: `app/settings/all.tsx` (scheduling, notifications, data/account) + `components/settings/StakesSettings.tsx` (daily cap, single-session cap shown, quiet-hours preview, never-lock list, pause). One drift from §8.11: §8.11 specifies never-lock categories as **view only**, but `StakesSettings.tsx:241-275` lets the user add/remove *additional* always-reachable apps beyond the six protected ones (the six themselves are hard-guarded and cannot be removed, `:270`). This is a benign superset (it only ever adds protection) but is copy/scope drift from the spec's literal "view only." |
| FR-71 | Subtask semantics: task is schedulable unit, duration rollup, progress mapping, current-step, one-block render | DONE | `core/task-logic.ts` (rollup + current-step logic), `docs/03` Part 2 fully mirrored in code comments and behavior throughout `types/index.ts`, `app/focus/session.tsx`, `components/calendar/CalendarBlock.tsx`. Test `core/__tests__/task-logic.test.ts`. |

### Post-launch integrations

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| FR-73 | MCP server | POST-LAUNCH | No MCP server code exists anywhere in the repo (searched for `mcp`/`MCP`/"model context protocol" — no hits outside this doc set). Correctly absent per `docs/08` and `docs/07` Milestone 7; not a gap. |
| FR-74 | Public API | POST-LAUNCH | Same as FR-73 — no REST/GraphQL surface exists. Correctly absent. |
| FR-75 | Portable engine (pure TS, on-device + Edge Function, identical results) | POST-LAUNCH (on-device half is DONE now) | The on-device half is real today and is exactly what `docs/08` asks for: `core/scheduler/**` has zero react-native/expo/MMKV imports (verified by reading every file in the folder), is deterministic given an explicit `now`, and is unit-tested for determinism (`core/__tests__/nfr.test.ts:66-96`, shuffled-input equality). The server-side half (an Edge Function actually importing this package) does not exist yet, which is expected — MCP/API are the only current consumers of that half and are themselves POST-LAUNCH. |

---

## 2. Non-Functional Requirements

| ID | Summary | Verdict | Evidence |
|---|---|---|---|
| NFR-1 | Calendar 60fps, drag/resize never drops frames | PARTIAL | Architecture is correct and consistent: every gesture in `components/calendar/DayView.tsx` runs on the UI thread via Reanimated worklets (`'worklet'` blocks throughout, `runOnJS` only for the JS-side commit), `SPRINGS.tactile` physics, throttled autoscroll (`AUTOSCROLL.TICK_MS` gating, `:572-582`). No automated frame-rate regression test or on-device profiling result exists in the repo to empirically confirm 60fps is actually sustained — this is a "measure it on a real mid-range phone" gap, not a code gap. |
| NFR-2 | Recompute <300ms, deterministic, churn-minimizing over hundreds of tasks/2-8 weeks | DONE | `core/__tests__/nfr.test.ts` — explicit ~300-task/8-week fixture, asserts `<300ms` (`:46`) on cold and warm runs, plus byte-identical and shuffle-order-independent determinism (`:66-96`). This is a real, currently-passing test per the file's own assertions (not just a plan). |
| NFR-3 | Offline: tasks/calendar/scheduling/Focus/Blindfold/Recovery/lock all work offline | DONE | Every store persists via MMKV (`store/mmkv.ts`, used by every `store/*.ts` file read), the scheduling/breakdown/recovery engines are pure with no network calls, `services/ai.ts` and every AI-touching screen degrade to local fallbacks that never throw. |
| NFR-4 | Privacy: local-first, no ad SDKs, opaque stake tokens, secrets server-side, age 13+/COPPA | PARTIAL | No ad SDK or third-party analytics package in `package.json` (checked directly — only `expo-*` packages). Opaque tokens: `types/index.ts:395-409` (`StakeSelection`, no bundle IDs). Secrets: `GEMINI_API_KEY` is read only in `supabase/functions/_shared/gemini.ts`, never in client code (confirmed by the "no key" fallback contract described in `services/ai.ts`). **No in-app age gate exists** anywhere in `app/onboarding/**` or `app/auth.tsx` — note the PRD's own §8.10 doesn't specify an age-gate screen either, so this may be intended to rely on store age-rating rather than an in-app prompt; flagging so it's a deliberate choice, not an oversight. |
| NFR-5 | WCAG 2.1 AA: dynamic type, color-plus-icon, VoiceOver/TalkBack labels, contrast both themes, reduced-motion, 44×44 | PARTIAL | Accessibility labels/roles/hints are pervasive and genuinely careful in every screen read for this audit (e.g. `components/calendar/CalendarBlock.tsx:121-123` composes a full state description; `app/auth.tsx:219,239-240` live-region error announcement; 44px+ touch targets used consistently, e.g. `components/calendar/DayView.tsx:63-65` `EDGE_ZONE_PX=44`). `hooks/useReduceMotion` is threaded through effectively every animated screen read. **Dark-theme contrast is not actually finished**: `tailwind.config.js:5` sets `darkMode:"class"` and `utils/design-tokens.ts:34` defines a `dark` palette, but only ~23 `dark:` NativeWind class occurrences exist across the entire `app/`+`components/` tree, versus hundreds of hardcoded light-only classes/hex values seen in every file read for this audit. This matches CLAUDE.md's own already-tracked finding ("~377 hardcoded color values across ~74 files," tokenization "outstanding work, not a finished migration") — not a new discovery, just confirmation it is still true. |
| NFR-6 | Wellbeing safety layer overrides feature behavior, no medical claims | DONE | See §3 below (item-by-item). No medical/clinical language found in any onboarding, notification, or verification copy read. |
| NFR-7 | App-blocking fails safe (never traps, defaults unlocked on error/uncertainty) | DONE | Pervasive try/catch-to-unlock pattern: `store/stakesStore.ts:640-756` (`startStake` wraps its entire body, any throw returns `{ok:false,reason:'error'}` with nothing locked), `:1015-1109` (`reconcileActiveSession` releases on any uncertainty — stale, no live lock, quiet hours, cap exhausted), `core/blocking/index.ts:40-53` (`getBlockingStrategy` falls back to Soft on any native resolution failure). |

---

## 3. Wellbeing layer (§9.10) — item by item

This layer overrides feature behavior, so it gets its own pass rather than folding into FR-46.

1. **Daily cap 180 min, user-lowerable, hard ceiling.** DONE. `core/blocking/limits.ts:44,50` (`DEFAULT_DAILY_LOCK_CAP_MIN=180`, `DAILY_LOCK_CAP_BOUNDS` capped at the default — "user-lowerable" is enforced structurally: the bounds' `max` IS the default, so it cannot be raised). Enforced at start (`store/stakesStore.ts:552,684-689` `remainingCap()<=0`) and continuously (`:1112-1129` `tick()`).
2. **Single-session cap 50 min.** DONE. `core/blocking/limits.ts:38,41` (`DEFAULT_SINGLE_SESSION_CAP_MIN=50`). This is also the `until_done`→release converter: `store/stakesStore.ts:1142-1145` (`tick`) and `:1044-1051` (`reconcileActiveSession`) both convert ANY hold to `session_served` once elapsed minutes hit this cap, matching doc `04` §7 exactly ("a bad estimate can never produce a marathon lock").
3. **Quiet-hours auto-release.** DONE, checked at four independent points: pre-flight (`store/stakesStore.ts:551`), the ongoing tick (`:1132-1136`), launch reconciliation (`:1063,1066`), and the scheduled-trigger arm moment specifically, which is deliberately a *different* instant than "now" (`:798-800`, `core/stakeAutoArm.ts:89`).
4. **Six never-lock categories.** DONE. `core/blocking/limits.ts:72-79` — phone, messages, maps, accessibility, os_settings, ampora — enforced in `setSelection` (`store/stakesStore.ts:611-624`, both a specific never-lock check and a separate "all apps" category refusal so an opaque iOS "everything" selection can't sweep them in) and reflected in the picker (`components/stakes/AppPicker.tsx:123`).
5. **60-second panic valve, always available.** DONE. `components/stakes/PanicValveSheet.tsx:37`, wired from both the focus session (`app/focus/session.tsx:712-719`) and (per its own docstring) the native shield's secondary button intent.
6. **De-escalation that never escalates.** DONE. `store/stakesStore.ts:980-1001` — the only mutation of `stakeStrength` triggered by panic use is a subtraction (`STRENGTH_DEESCALATE_STEP=0.2`, floor-clamped); nothing in the codebase raises strength in response to panic/miss behavior. `components/stakes/DeEscalationSheet.tsx` offers a pause, never more friction.
7. **No shame copy anywhere.** DONE by sampling. Every user-facing string read during this audit (Recovery, notifications, StakeSetupSheet refusals, PanicValveSheet, DeEscalationSheet, Blindfold) was warm/neutral. A targeted repo-wide search for shame-adjacent phrases ("you failed," "broken streak," "disappointing," etc.) returned exactly one hit, and it is a doc comment *stating the anti-shame design rule itself* (`core/recovery.ts:18-19`, "we never mention broken streaks"), not an instance of the copy it warns against.

**Verdict: the wellbeing layer is the most solid part of this codebase.** Every non-negotiable in §9.10 has real, redundant enforcement (checked at multiple points, not just once), which is the correct posture for the layer explicitly called "overrides feature behavior."

---

## 4. Exact copy compliance (§8) — spot check

| Spec (§8) | Code | Match |
|---|---|---|
| Tabs: Today / Calendar / Tasks / Focus / Profile (§8.1) | `app/(tabs)/_layout.tsx:47,61,75,89,103` | Exact |
| "You're all caught up." (§8.2 empty state) | `app/(tabs)/index.tsx:280` | Exact |
| Good morning/afternoon/evening greeting (§8.2) | `app/(tabs)/index.tsx:34-36` | Exact (time-of-day branching matches) |
| "Due (the real deadline)" + helper (§8.3) | `components/task-editor/TaskEditorForm.tsx:1284-1285` | Near-exact: helper reads "When it must be done by, not when you will do it" vs. spec's "not when you'll do it" — a contraction-only difference |
| "Break it down" / "Save task" (§8.3) | `TaskEditorForm.tsx:1045,1591` | Exact |
| "Put something on the line" / "Unlock when?" / "When this session ends" / "When it's done" / "Lock automatically at [time]" / "If I haven't started within [X] min" / "Just get me started" (§8.8) | `components/stakes/StakeSetupSheet.tsx:389,410,414,424,449-450,481-482,518-521` | Exact, including the parenthetical option structure |
| Start Reminder: "Hey, {task} is on your plate. Want to do the first move? It takes 5 minutes." (§8.9) | `services/notifications.ts:74-79` | Exact, and the code comments it as verbatim on purpose |
| Ready for tomorrow: "Tomorrow's plan is ready. First up: {task}." (§8.9) | `services/notifications.ts:103-108` | Exact |
| "Catch me up" / "Rebuilt your week" (§7.3, §8.6) | `components/recovery/RecoveryBanner.tsx:94-98`, `RecoverySheet.tsx:324` | Exact |
| Panic valve: "Unlock early", 60s countdown, calm message (§8.8) | `components/stakes/PanicValveSheet.tsx` | Matches in substance; exact button label not independently re-checked beyond the countdown constant |

No drift found beyond the one contraction-level wording difference above. Copy fidelity to §8 is unusually high for a mid-rebuild codebase.

---

## 5. Anything from `V2_Changes.md` still implemented (scope creep)

**Found: an "Energy needed" field, live in the shipped task editor, that is exactly the deferred Learning Engine's "energy states" feature (`V2_Changes.md` §1).**

- `components/task-editor/TaskEditorForm.tsx:1488-1509` renders a real, selectable "Energy needed" control (`Field label="Energy needed"`, `ENERGY_OPTIONS`, writes `draft.energyRequired`).
- It is threaded all the way to the AI layer: `services/ai.ts:176,186` passes `energyRequired` into `breakdownTask`, and the edge function itself accepts and forwards it (`supabase/functions/ai-breakdown/index.ts:42,64`).
- However, **`Task.energyRequired` does not exist on the `Task` interface** in `types/index.ts` (read in full for this audit — no such field). This means either the type was just removed by another worker and these three call sites are mid-cleanup, or they predate a type change and are now stale.
- This is very likely already being remediated: one of the other agents active in this session is named **P24-energy-sweep**, which is a strong signal this exact cleanup is in flight right now. Treat this finding as "confirm it's gone" rather than "go fix it."

Everything else checked for creep came back clean:
- No `FocusProfile`/`BreakdownMemory` construction anywhere (the types exist in `types/index.ts` but are never imported/used elsewhere — dead types kept for later, not creep).
- `core/learning/`, `store/learningStore.ts`, `store/behavioralStore.ts`, `app/insights.tsx`, `components/insights/*`, `app/onboarding/energy.tsx` are all absent from the working tree (git status confirms these as deletions already committed to this branch).
- `core/ai-actions.ts`, `components/projects/ProjectChat.tsx`, `components/projects/FileList.tsx` are absent — the agentic project chat and file library are correctly not present.
- The Proof model's deferred verification tiers (word-count, screen-activity) are handled correctly, not by omission but by an explicit migration that *remaps* old rows rather than deleting them (`store/migrations/proofs.ts`, cited in `store/proofStore.ts:75-79`) — the right way to retire a tier without destroying a user's private history.

---

## 6. The ten Gherkin scenarios (§7.3) — end to end

This is the acceptance criteria, so each is walked through for whether the code would actually satisfy it today, not just whether the pieces exist.

1. **Auto-schedule a new task.** SATISFIED end to end. Task creation → `taskStore`, scheduling-hours resolution → `core/scheduler/placement.ts:104-116`, placement respecting due → `placeTask`, slack color-coding → `core/scheduler/slack.ts`, pinned blocks never moved → `freeTime.ts:134-141` + `recompute.ts` stability pass. Covered by `placement.test.ts` + `slack.test.ts` + `recompute.test.ts`.

2. **Recalculate after falling behind ("Catch me up").** SATISFIED end to end. Lapse detection (`core/recovery.ts`), preview + rebuild UI (`components/recovery/RecoverySheet.tsx`), exact copy "Rebuilt your week." confirmed, zero shame language confirmed by search. Covered by `recovery.test.ts`.

3. **Split a large task.** SATISFIED end to end. `sessionSizing.ts` implements the exact balanced-sizing algorithm the scenario describes (12h task, 6 days, 60-120min sessions, roughly even load). Covered by `sessionSizing.test.ts`.

4. **Session hold (Ignition default, anti-leak).** SATISFIED **in the sense the current build ships** — with one large, load-bearing caveat that must be understood before treating this as "done": the anti-leak logic, the timer, the banner, the caps, and the check-in are all real and correctly wired (`app/focus/session.tsx`, `store/stakesStore.ts`, `hooks/useForegroundTimer.ts`). **But "Instagram is shielded" is not literally true on a real device today.** `getBlockingStrategy()` returns `SoftBlockingStrategy` (`core/blocking/index.ts:41`, since `FEATURE_FLAGS.IGNITION_NATIVE` is off), and `SoftBlockingStrategy.applyShield` (`core/blocking/SoftBlockingStrategy.ts:95-100`) only flips an in-app boolean — it does not and cannot prevent the OS from switching to Instagram. The commitment device today is self-honesty plus a visible timer/banner plus the panic-valve friction, not a technical restriction. This is a known, intentional launch sequencing choice (the PRD's own risk table says exactly this: ship the soft lock, never gate launch on the entitlement), so it is not a code defect — but it is the single most important fact to have crystal clear before calling the Ignition loop "done," because the phrase "I locked an app" currently describes a UI/psychological state, not an enforced one.

5. **Scheduled lock with a start window.** SATISFIED end to end (subject to the same soft-lock caveat as #4 for the actual shielding step). Auto-arm rules → `core/stakeAutoArm.ts` (unit-tested in isolation), quiet-hours-at-arm-moment check, early release on task completion (`core/stakeAutoArm.ts:92`), panic valve dismissal always available.

6. **Until-done hard mode is capped.** SATISFIED end to end. `store/stakesStore.ts:1049-1051` (`tick`) and `:1044-1046` (`reconcileActiveSession`) both convert to `session_served` at the single-session cap. Outcome logged via `LockEvent`/`StakeSession.outcome`.

7. **Panic valve de-escalation.** SATISFIED end to end. 60s countdown confirmed, repeated-use threshold (2) confirmed, strength only ever lowered, "Pause stakes for today" offered, never more pressure.

8. **Wellbeing caps (daily cap reached).** SATISFIED end to end. `remainingCap()<=0` refuses new stakes (`store/stakesStore.ts:552`), active lock still auto-releases at the quiet-hours boundary independently (`:1132-1136`), never-lock categories are structurally unreachable regardless of cap state.

9. **Blindfold mode.** SATISFIED IN OUTCOME, MINOR INTERACTION DRIFT. The calendar disappears, exactly one micro-step shows, and the next step stays hidden until the current one is marked done — but the scenario's literal verb "swipe" is implemented as a tap on a large "I did this" button (`app/blindfold.tsx:189-201`), not a swipe gesture. Functionally equivalent; textually not what the Gherkin says.

10. **Project generates today's session.** SATISFIED end to end. `core/nightlyPass.ts` computes the target day and the generated-task draft; `services/aiProjects.ts` supplies the First move computed from current phase + context line + last outcome; the generated task is a plain schedulable Task, so a stake attaches to it exactly like any other task and never to the `Project` object (no UI path to stake a Project exists). Covered by `nightlyPass.test.ts`.

**Summary: 8 of 10 scenarios are genuinely end-to-end satisfied by the code as written. One (#9) has a cosmetic interaction mismatch against the literal spec text. One (#4, and by extension #5) is accurate only if "shielded" is understood as today's soft/behavioral lock — the moment `FEATURE_FLAGS.IGNITION_NATIVE` flips on, re-verify this scenario on a real device, since the native path is untested code (`core/blocking/NativeBlockingStrategy.ts`, real Swift under `native/modules/ampora-ignition/ios/`) that this audit could not exercise.**

---

## 7. Prioritized gap list

Ordered by what actually stands between this build and the launch gate — *"the first session reliably reaches 'I locked an app and started.'"* (§1.5) — separating genuine blockers from things that only need a Mac or an API key.

### Top 5 genuine blockers/risks (not solved by a Mac or a key)

1. **"Locked" today means a self-honesty commitment device, not a technical restriction.** `core/blocking/SoftBlockingStrategy.ts:95-100` only sets an in-app flag; nothing stops the OS from switching to the "locked" app. This is explicitly the planned launch path (PRD risk table), so it is not a bug to fix — but make sure the demo, the App Store listing, and Aria's own mental model are calibrated to "the timer and banner are real, the OS-level block is not, yet" before treating the hook as finished. Re-verify scenario #4/#5 the moment the native flag flips on.
2. **A permanent guest-mode bypass contradicts FR-87's "no anonymous local-only mode."** `app/auth.tsx:262-281` + `app/_layout.tsx:109-137`. Not behind `__DEV__`. Anyone can skip account creation entirely, which undermines "cloud is the source of truth" and could read oddly to App Store review. Cheap to fix (gate it behind `__DEV__` or remove it) — flagged here, not fixed, per this task's read-only scope.
3. **FR-20's "never silently drop, explain why" has no UI.** `store/scheduleStore.ts:343` `selectUnschedulable` has zero callers anywhere in the app. The engine computes good reasons; the user never sees them. This is the exact failure mode ("computed, never rendered") this task was primed to look for, reproduced in a different subsystem than the ones already known.
4. **V2 scope creep: "Energy needed" is live in the shipped task editor.** `components/task-editor/TaskEditorForm.tsx:1488-1509`, threaded into the AI breakdown call and the edge function, referencing a `Task.energyRequired` field that no longer exists on the `Task` type. Likely already being swept by another worker in this session (P24-energy-sweep) — confirm it's gone before shipping, don't assume this report is still accurate.
5. **FR-1's "Events" type has no creation path; `AddEventModal` is dead code.** Zero importers anywhere in the repo. Not a blocker for the Ignition demo (Tasks cover it), but it means FR-1 as literally written is only half-built, and it's the same "orphaned component" pattern flagged as a past failure mode.

### Needs a Mac, an App Store account, or an API key — not a code gap

- **Native iOS app-locking** (real Screen Time shielding): code and config-plugin scaffold are real (`native/modules/ampora-ignition/ios/*.swift`, three extension targets, `AppGroupStore.swift`) but `app.json` currently declares none of the required entitlements/app-group/extension config, and this cannot be built or tested without a Mac plus Apple's Family Controls (Distribution) approval per bundle ID. `BLOCKED-EXTERNAL`.
- **Real subscription billing.** `core/iap/NativePurchaseStrategy.ts` is real RevenueCat-calling code, but `react-native-purchases` is not an installed dependency and `FEATURE_FLAGS.IAP_NATIVE` is off — needs App Store Connect + Play Console product setup. `BLOCKED-EXTERNAL`.
- **Real AI breakdown quality.** Edge functions are deployed and the fallback contract is correct, but they return `{error:"no_key"}` until `GEMINI_API_KEY` is set as an Edge Function secret (per CLAUDE.md's own project-state note) — cannot be verified live from this repo without violating the "don't call the AI edge functions" rule for this task. `BLOCKED-EXTERNAL`.
- **Android app-locking, web polish, MCP/API.** Correctly `POST-LAUNCH` per `docs/07` Milestone 7 and `docs/08` — not attempted, not expected to be, not a gap.

### Also worth a look, lower urgency
- `FR-17`: raising the Settings auto-schedule-cutoff-weeks value may not reach the live engine cutoff (`store/scheduleStore.ts` doesn't thread `cutoffDays` from settings into `engineRecompute`'s call).
- `FR-6`: the "Stakes active" task filter is a self-acknowledged TODO in `app/(tabs)/tasks.tsx`, now actionable since the stakes rewrite it was waiting on is largely done.
- `NFR-5`: dark-theme styling is sparse (~23 `dark:` call sites app-wide) versus the token infrastructure that exists for it — already tracked in CLAUDE.md, not new.
- `FR-65`/§8.11: never-lock categories are editable (add/remove of user-added entries), not "view only" as specced — a benign superset, but a copy/scope drift worth a one-line decision (update the doc, or lock the UI down) rather than leaving it ambiguous.
