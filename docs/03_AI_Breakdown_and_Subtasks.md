# Ampora — Breakdown Engine and Subtask Semantics

> Two questions, precisely: how the AI breaks a task down into a checklist and a First move, and how those subtasks behave inside a parent task across scheduling, completion, the calendar, recurrence, and stakes. Companion to `01_PRD.md` Sections 7, 9.5, 9.7. Breakdown memory is deferred (see `V2_Changes.md`); each breakdown is fresh, with the Refine chat as the correction path. No em dashes, no semicolons.

---

## Part 1: How breakdown works

### 1.0 Scope and honest limits (read first)
Breakdown is a supporting feature, not the main event. Ignition (locking your own apps for a work session) is the product. The job of breakdown is narrow: give the user a small, concrete next thing to do right now so they can start, and so Ignition has a sensible session goal. It does not need to be a perfect project planner.

Honest limits: AI breakdown is strong for general and common tasks and weaker for highly specific ones. Three things cover that gap, in order: source grounding (use the real assignment), custom and voice breakdown (the user provides the steps), and the fact that for specific tasks the source usually already contains the steps (1.3). When all of that still leaves a weak breakdown, that is acceptable, because the user can edit it in seconds and the lock still works.

### 1.1 The core problem and the two mechanisms
Generic LLM breakdown fails when a task has specific real steps (a lab procedure, a coding spec, a rubric-bound essay). Accuracy comes from two mechanisms, not from a bigger model alone:

1. **Source grounding.** The model derives steps from the real assignment text, not from a generic template.
2. **Refine chat.** The user corrects the breakdown conversationally and it regenerates.

### 1.2 The breakdown pipeline (exact data flow)
When the user taps `Break it down` (or Claude calls `break_down_task` via MCP), this runs:

```
1. Classify the task -> taskTypeKey            (1.4)
2. Resolve source material (if attached)       (1.3)
3. Assemble the prompt: task + source + output contract   (1.5)
4. Call the breakdown model -> JSON subtasks + First move
5. Validate against the rules; repair or retry if invalid  (1.6)
6. Return for review; user edits/accepts
7. Cache the accepted result keyed by (taskTypeKey, titleHash, sourceHash)
```

The model call is the only expensive step. It happens only on explicit `Break it down` or `Refine`, and results are cached, so cost stays low.

### 1.3 Source material resolution
`Task.sourceRefs` can be pasted text or a single attached document, and it can be attached in any breakdown mode: AI-authored, `Write my own`, or `Speak my own`. Source attachment is orthogonal to who authors the steps.
- Text: used directly.
- A single document (PDF or similar): extract its text into plain text and pass it as the grounding block.
If the source is long, extract the requirements and any numbered steps or rubric criteria first, then break down against that, so the prompt stays focused. (Multi-file libraries and image/screenshot OCR sources are deferred to V2.)

Two important cases:
- **Source already contains the steps.** If the document already lists the parts of the assignment (a rubric with 5 criteria, a problem set with numbered problems, a worksheet with sections), the engine extracts those as the breakdown directly rather than inventing its own. This is the strongest accuracy case: "just use the steps in this document."
- **Custom mode plus source.** When the user wrote or spoke their own steps and attached a source, the AI aligns their steps to the source (keeps their plan, fills only the gaps the source clearly implies, flags anything the source requires that the user missed).

### 1.4 Task-type classification
The breakdown call returns a `taskTypeKey` along with the subtasks, normalized to a small controlled vocabulary plus a free-form tag. Examples: `essay`, `reading`, `pset` (with a subject suffix like `pset:calc`), `lab:chem`, `coding:python`, `study:exam`, `project`, `admin`. This keys the result cache.

### 1.5 Prompt architecture (concrete)
```
SYSTEM:
  You break a student task into an ordered checklist they can actually start.
  Hard rules:
   - The FIRST subtask is one concrete physical action that takes <= 10 minutes
     (for example "open a doc and write one sentence stating your thesis",
      never "start the essay").
   - Also output ONE "first move" of 2 to 5 minutes (the smallest possible start).
   - If a deadline is more than 24h away: 1 to 3 starter subtasks <= 10 min each,
     plus larger subtasks of 15 to 30 min for the rest.
   - If the deadline is within 24h: only short subtasks of 5 to 10 min, no large blocks.
   - Max 8 subtasks total.
   - If SOURCE is provided, derive steps from its real requirements, numbered steps,
     or rubric criteria. Do not invent steps the source does not imply.
  Output strict JSON only (schema below). No prose.

CONTEXT:
  TASK: { title, notes, durationMin, dueAt, subject/list, hoursUntilDue }
  SOURCE: <<resolved source text, or "none">>

OUTPUT SCHEMA:
  {
    "taskTypeKey": "string",
    "firstMove": { "text": "string", "estimatedMin": 2-5 },
    "subtasks": [ { "title": "string", "estimatedMin": number, "order": number } ]
  }
```

### 1.6 Validation and repair
After generation, validate: first subtask <= 10 min and concrete, exactly one first move 2 to 5 min, <= 8 subtasks, deadline-aware sizing, JSON parses. If invalid, do one repair pass (re-prompt with the violation called out) before falling back. Abstract-task detection (keywords essay/research/analyze/write/project/presentation) raises granularity. Fallback: a generic 4-step template behind a warm banner; never cache fallbacks.

### 1.7 Refine chat
`Refine` opens a chat input ("Tell me how to break this down differently"). The instruction plus the prior breakdown are sent to `ai-refine-breakdown`, which regenerates the subtask list conversationally. This is the universal correction path for a breakdown that came out wrong. `Make easier` re-simplifies a single subtask without touching the rest.

### 1.8 Custom and voice breakdown modes
The task editor offers `Break it down` (AI authors), `Write my own` (the user types the steps), and `Speak my own` (the user speaks the steps, transcribed). For the user-provided modes, the AI cleans and structures the input without changing the plan or inventing steps: split into subtasks, preserve wording and intent, add time estimates, ensure a concrete First move, fix obvious ordering, remove filler. Example: the user says "okay so first I gotta find some sources then read them and then outline and then write it and then edit." The AI returns a First move ("Open a doc and paste your essay question.") then "Find 3 sources (20m)", "Read and take notes (40m)", "Outline (20m)", "Draft (60m)", "Edit (30m)". Same steps, cleaned and time-boxed.

---

## Part 2: How subtasks behave inside a task (the semantics)

The model below is the single source of truth for subtask behavior.

### 2.1 The core decision: the schedulable unit is the TASK, not the subtask
Subtasks are an ordered execution checklist inside a task. The engine schedules the task (as one block, or several split sessions), not each subtask as its own calendar block. This keeps the calendar clean and avoids over-constraining the user's minute-to-minute work. An optional power toggle `Schedule subtasks separately` (off by default) exists for the minority who want each subtask time-boxed.

Rationale: ADHD execution wants one clear "next step", not 8 tiny calendar blocks to manage. Calendar legibility wants one block per work session. The engine wants to place total time efficiently, not solve a sub-block packing problem.

### 2.2 Duration rollup
When a task has subtasks, the task's effective `durationMin` = sum of subtask `estimatedMin`, kept in sync on every subtask edit. A manually set duration is overridden when subtasks exist (the app notes this). The First move's time is not added to the total (it is the first slice of the first subtask).

### 2.3 Progress mapping (this connects subtasks to scheduling)
Completing subtasks advances the task's `progressMin` = sum of completed subtasks' `estimatedMin`. On the next recompute, only the remaining duration is scheduled (partial completion, FR-18). Example: a 60-min task with 5 subtasks, finish 2 worth 25 min, and the engine schedules the remaining 35 min. Working subtasks naturally shrinks the scheduled block over time.

### 2.4 The "current step" surfacing
At any moment a task exposes its next uncompleted subtask. This drives:
- Today: the First move card (before start) then the next subtask.
- Focus session: the large current-step text.
- Blindfold: the single shown micro-step.
- Notifications: "Start with: {next subtask}".

### 2.5 Completion rollup
Completing all subtasks completes the task. Marking the task complete directly marks all remaining subtasks complete. Either path sets `completedAt`.

### 2.6 Splitting vs subtasks are orthogonal
- Splitting decides how the total time is spread across the calendar (session sizes from min/max block and workload distribution).
- Subtasks decide how the work is decomposed for execution.
A 6-hour essay can be 4 subtasks and 3 two-hour sessions. Sessions do not have to align to subtask boundaries. The user works the next uncompleted subtasks in whatever session they are in. Optional heuristic: try to start sessions on subtask boundaries when it does not hurt packing.

### 2.7 Calendar rendering
A task with subtasks renders as one block per session, labeled with the task title, an `N steps` chip, and a progress fill. Tapping opens the task with the subtask checklist. Split sessions at different times render as separate blocks of the same task.

### 2.8 Editing and re-breakdown
- Adding, removing, reordering, or resizing subtasks updates the parent duration and triggers a debounced recompute.
- Re-running `Break it down` replaces the subtask list. If progress exists, confirm first ("You have progress on this. Replace the steps?") and preserve completed-equivalent progress where possible.

### 2.9 Recurrence and subtasks
A recurring task carries a subtask template. Each occurrence starts with a fresh copy of the template (all unchecked). Completing one occurrence does not affect the next.

### 2.10 Stakes and subtasks
The First move is the on-ramp shown at the start of a session and the unit shown in Blindfold; it is not itself a stake unlock condition (see `04`). A session's goal can be a specific subtask or the whole task, so a user can run a locked session against "outline done" as the session goal. The lock is held for the session (or, for the opt-in until_done hold on a short task, until verified completion), never keyed to a bare First-move tap.

### 2.11 Edge cases
- Subtasks sum to less/more than a prior manual estimate: subtasks win; parent duration = sum.
- A subtask is huge (over max block): the splitting algorithm still splits the parent by min/max block across sessions; the subtask is just a checklist item that may span sessions.
- Zero subtasks: the task schedules by its own duration with the First move as the only starter.
- Partial work inside one subtask: progress is counted at subtask granularity (completed subtasks only) to keep it simple.

### 2.12 Data relationships (summary)
```
Task (schedulable, has durationMin = sum of subtasks)
 ├── StarterAction "First move" (2 to 5 min, the session on-ramp)
 ├── Subtask[] (ordered checklist; estimatedMin; done)
 ├── ScheduledBlock[] (one per session; engine-placed; pinnable)
 └── progressMin = sum(completed subtasks' estimatedMin) -> drives partial scheduling
```

---

## Part 3: Requirements this maps to (in the PRD)
- FR-7, FR-8: source-grounded breakdown, First move, subtasks, Make easier, Refine.
- FR-71: subtask semantics (task is the schedulable unit; duration rollup; progress mapping; current-step surfacing; completion rollup; orthogonal splitting; one-block rendering; optional Schedule subtasks separately).
- FR-75: the breakdown modules run both on-device and server-side, so they work identically from the app and from Claude via MCP (post-launch). See `08`.
