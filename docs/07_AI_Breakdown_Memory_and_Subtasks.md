# Ampora — Technical Spec: Breakdown Engine, Memory, and Subtask Semantics

> Answers three questions precisely: how the AI breaks a task down, how it remembers a specific user so breakdowns improve over time, and how the broken-down subtasks actually behave inside a parent task across scheduling, completion, the calendar, recurrence, and stakes. Companion to `01_PRD.md` Sections 7, 9.5, 9.7. No em dashes, no semicolons.

---

## Part 1: How breakdown actually works

### 1.0 Scope and honest limits (read first)
Breakdown is a supporting feature, not the main event. Ignition (locking your own apps against a goal) is the product. The job of breakdown is narrow and specific: give the user a small, concrete next thing to do right now so they can start, and so Ignition has a sensible per-session goal to lock against. It does not need to be a perfect project planner.

Honest limits: AI breakdown is strong for general and common tasks and weaker for highly specific ones. Four things cover that gap, in order: source grounding (use the real assignment), custom and voice breakdown (the user provides the steps), the connected Claude (which can supply context it knows about the user and the exact assignment, Part 1C.6), and the fact that for specific tasks the source usually already contains the steps (Part 1.3). When all of that still leaves a weak breakdown, that is acceptable, because the user can edit it in seconds and the lock still works.

### 1.1 The core problem and the three mechanisms
Generic LLM breakdown fails when a task has specific real steps (a lab procedure, a coding spec, a rubric-bound essay). Accuracy and "broken down the right way" come from three mechanisms working together, not from a bigger model alone:

1. **Source grounding.** The model derives steps from the real assignment text, not from a generic template.
2. **Refine chat.** The user corrects the breakdown conversationally and it regenerates.
3. **Memory.** After the user corrects a kind of task a few times, future tasks of that kind start out right.

### 1.2 The breakdown pipeline (exact data flow)
When the user taps `Break it down` (or Claude calls `break_down_task` via MCP), this runs:

```
1. Classify the task -> taskTypeKey            (1.4)
2. Resolve source material (if attached)       (1.3)
3. Retrieve user memory for taskTypeKey        (Part 2)
4. Assemble the prompt: task + source + memory + output contract   (1.5)
5. Call the breakdown model -> JSON subtasks + First move
6. Validate against the rules; repair or retry if invalid          (1.6)
7. Return for review; user edits/accepts
8. Capture the diff (generated vs accepted) -> update memory        (Part 2)
9. Cache the accepted result keyed by (taskTypeKey, titleHash, sourceHash)
```

The model call is the only expensive step. It happens only on explicit `Break it down` or `Refine`, and results are cached, so cost stays low.

### 1.3 Source material resolution (works in every mode)
`Task.sourceMaterial` can be text, a file, a photo/screenshot, or a voice transcript, and it can be attached in ANY breakdown mode: AI-authored, `Write my own`, or `Speak my own`. Source attachment is orthogonal to who authors the steps.
- Text: used directly.
- File or photo or screenshot: extract text first (PDF text extraction, or OCR for images, screenshots, and whiteboards) into plain text.
- Voice: speech-to-text transcript.
The resolved source text is passed to the model as the grounding block. If the source is long, summarize-then-ground (extract the requirements and any numbered steps or rubric criteria first, then break down against that), so the prompt stays focused.

Two important cases:
- **Source already contains the steps.** If the uploaded PDF or screenshot already lists the parts of the assignment (a rubric with 5 criteria, a problem set with numbered problems, a worksheet with sections), the engine extracts those as the breakdown directly, rather than inventing its own. This is the strongest accuracy case: "just use the steps in this PDF."
- **Custom mode plus source.** When the user wrote or spoke their own steps AND attached a source, the AI aligns their steps to the source (keeps their plan, fills only the gaps the source clearly implies, flags anything the source requires that the user missed).

### 1.4 Task-type classification
The breakdown call returns a `taskTypeKey` along with the subtasks, normalized to a small controlled vocabulary plus a free-form tag. Examples: `essay`, `reading`, `pset` (with a subject suffix like `pset:calc`), `lab:chem`, `coding:python`, `study:exam`, `project`, `admin`. Memory is keyed by this. For fuzzy matching when an exact key is missing, fall back to embedding similarity over the titles of past tasks (nearest neighbor) to find the closest existing memory profile.

### 1.5 Prompt architecture (concrete)
The breakdown prompt is assembled from blocks. This is what makes it grounded and personalized.

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
   - Match the user's preferences in USER_PROFILE and the style of USER_EXAMPLES.
  Output strict JSON only (schema below). No prose.

CONTEXT:
  TASK: { title, notes, durationMin, dueAt, subject/list, energyRequired,
          hoursUntilDue }
  SOURCE: <<resolved source text, or "none">>
  USER_PROFILE: <<summarized preferences for this taskTypeKey, or "new type">>
  USER_EXAMPLES: <<the user's last 1 to 3 ACCEPTED breakdowns for this taskTypeKey,
                   verbatim, as few-shot examples>>

OUTPUT SCHEMA:
  {
    "taskTypeKey": "string",
    "firstMove": { "text": "string", "estimatedMin": 2-5 },
    "subtasks": [ { "title": "string", "estimatedMin": number, "order": number } ]
  }
```

`USER_EXAMPLES` is the single most powerful personalization lever. Showing the model how this exact user broke down their last two similar tasks (after their own edits) makes new breakdowns match their real process far better than any instruction.

### 1.6 Validation and repair
After generation, validate: first subtask <= 10 min and concrete, exactly one first move 2 to 5 min, <= 8 subtasks, deadline-aware sizing, JSON parses. If invalid, do one repair pass (re-prompt with the violation called out) before falling back. Abstract-task detection (keywords essay/research/analyze/write/project/presentation) raises granularity.

### 1.7 Refine chat
`Refine` opens a chat input. The user says things like "this is a coding task, break it down by function", "step 3 is too big, split it", "follow the rubric's four criteria", "fewer, bigger steps". `ai/refine-breakdown` is called with the prior breakdown, the source, and the instruction, and regenerates. The refine instruction is also a strong memory signal (1.4 of Part 2).

### 1.8 Fallback and caching
On model error or quota exhaustion, a generic 4-step template behind a warm banner ("Showing general steps, not task-specific"). Never cache fallbacks. Cache accepted real results keyed by (taskTypeKey, titleHash, sourceHash) so re-opening does not re-burn the model.

---

## Part 1B: How a breakdown is actually reasoned (deeper)

The quality of a breakdown is not just "list some steps". The engine reasons in a specific way, enforced by the prompt.

### 1B.1 Backward planning from the deliverable
The model first names the concrete deliverable (a 5-page essay, 10 solved problems, a working function, a studied chapter), then identifies the real requirements (from the source if attached), then works backward into the steps that actually produce that deliverable, then front-loads the smallest possible start. Backward planning produces steps that lead to done, instead of generic forward filler like "do research" that never bottoms out.

### 1B.2 Duration budgeting (how each step gets a time)
- If the user set a task duration, the subtask estimates must sum to roughly that budget. The model distributes the budget across steps. It never invents more time than the user allotted.
- If no duration is set, the model estimates each step and the parent duration becomes the sum (Part 3.2).
- All estimates are scaled by the user's per-task-type estimation multiplier (time-blindness, PRD 9.5.6), so the budget reflects how long things actually take this person, not an optimistic guess.

### 1B.3 Deadline-pressure modes
Granularity and step choice adapt to time-until-due:
- Comfortable (more than about a week): may include exploration, research, and a quality/review pass.
- Normal (1 day to a week): lean, focused steps, one review step.
- Crunch (under 24h): minimum-viable-completion only. Shortest possible steps, drop nice-to-haves, order highest-impact-first. This is the Panic Mode behavior expressed inside the breakdown (get the most points in the least time).

### 1B.4 First-move design rules
The First move is the single most important subtask because it defeats activation energy. It must be the smallest physical action that:
- takes under 5 minutes,
- requires no decision,
- produces something visible,
- is basically impossible to fail.
"Open a doc and type the title" or "write one sentence stating your thesis", never "brainstorm a topic" or "think about the essay". Decisions and ambiguity are the enemy of starting.

### 1B.5 Vague-task handling
If a task is too vague to break down well ("study for chem"), the model does not silently guess a scope that might be wrong. It either inserts an early "decide scope" step (pick which chapters, set a target) or, in the app, surfaces one short clarifying question before generating ("Which chapters or how long do you want to study?").

### 1B.6 Sequential by default
Subtasks are an ordered sequence (do 1, then 2). There is no parallel or dependency graph inside a task. Cross-task ordering uses the task-level `dependsOn`. This keeps execution simple and the "current step" unambiguous.

---

## Part 1C: Custom and voice breakdown (the user provides the steps, AI cleans them up)

Sometimes the user already knows exactly how they want to do a task. In that case the AI's job is to format and time-box, not to author. There are three input modes in the task editor's breakdown area.

### 1C.1 The three modes
- `Break it down` (AI authors, Parts 1 and 1B).
- `Write my own` (the user types their steps).
- `Speak my own` (the user dictates their steps by voice).

### 1C.2 Write my own
The user types a rough list of steps. The AI runs a cleanup pass that does NOT change their plan or invent steps:
- split the input into discrete subtasks,
- preserve the user's wording and intent (do not rewrite meaning),
- assign an estimatedMin to each (using the budget and the estimation multiplier),
- ensure or insert one concrete First move,
- fix ordering only if it is clearly out of order,
- remove filler and standardize formatting.
The user reviews and edits. Nothing is added that changes their plan.

### 1C.3 Speak my own
The user speaks their steps and they are transcribed. A spoken list is rambly, so the AI structures it the same way, cleaning filler, ums, and run-ons while preserving the steps and intent. Example: the user says "okay so first I gotta like find some sources then read them and then I guess outline and then write it and then edit." The AI returns: First move "Open a doc and paste your essay question." then "Find 3 sources (20m)", "Read and take notes (40m)", "Outline (20m)", "Draft (60m)", "Edit (30m)". Same steps, cleaned and time-boxed.

### 1C.4 The cleanup contract (prompt)
```
The user wrote or spoke their OWN steps. Do NOT change their plan or invent steps.
Clean and structure only:
 - split into discrete subtasks,
 - preserve their wording and intent,
 - add a time estimate to each (respect the duration budget),
 - ensure one concrete first move under 5 minutes,
 - fix obviously wrong ordering,
 - remove filler.
Output the same JSON schema. No new steps the user did not imply.
```

### 1C.5 Why this matters and how it feeds memory
Some people know their process and want the AI to respect it (a coder's function-by-function plan, a writer's outline-first habit). Custom breakdowns also respect expertise. And a user-authored breakdown is the highest-signal memory exemplar (Part 2), so the system learns the user's personal style fastest from these. Hybrid is allowed: the user writes the first few steps and asks the AI to fill the rest.

### 1C.6 Context from the connected Claude
There are two sources of "knows you" for a breakdown. The in-app breakdown memory (Part 2) knows your task-type preferences and your past accepted breakdowns. The connected Claude (the MCP connection, doc `08`) knows broader context about you from your conversations: your actual classes, the specific assignment you were just discussing, your skill level, what you have struggled with before.

The breakdown engine accepts an optional `externalContext` input. When a breakdown is initiated through the Claude connection (Claude calls `break_down_task`), Claude supplies what it knows about you and the exact task as additional grounding, on top of the local memory and any attached source. So if you have been talking to Claude about your AP Chem stoichiometry unit, a chem breakdown triggered through Claude can reflect that. When breakdown is triggered in-app without the connection, it uses local memory and source only. This is an enhancement, not the default path, and it is your own Claude and your own data.

---

## Part 1D: Tasks vs Projects (two types)

Short work and ongoing work are different objects in Ampora. This doc covers Tasks. Projects have their own full spec in `10_Projects.md`.

- **Tasks** are short, doable in about 1 to 2 days, not a big commitment (a problem set, an essay, a reading). They use the breakdown in this doc (AI-authored or custom, with optional source). They are the easier case.
- **Projects** are larger and usually ongoing or recurring (a research paper, "Study for SciOly Remote Sensing"). A project keeps a persistent library of uploaded files, has its own chat you talk to like an assistant, tracks how far along you are, learns from you over time, and generates the day-to-day Tasks you actually schedule and lock against. Full spec in `10`.

One breakdown principle carries across both and is the fix for "the first step of a huge thing is impossible to pick": you never compute a First move for a whole project, only for the current session, which is always small and obvious. A research paper's first step is unknowable, but today's first step ("open your draft and reread your last paragraph") is not. A project adjusts the suggested first or next task based on how far along you are (doc `10`).

---

## Part 2: How it remembers you (the memory system)

This is per-user, retrieval-augmented personalization. It is NOT fine-tuning a shared model on user data (that is expensive, slow, and leaks one user's data into others). Instead Ampora keeps a small per-user store and injects it into the prompt at generation time. "Remembering you" means your breakdowns increasingly match how you actually work, sound like your own steps, and stop including steps you always delete.

### 2.1 What is stored (per user, per task-type)
The `BreakdownMemory` entity (in the data model), keyed by `taskTypeKey`:
```
BreakdownMemory {
  taskTypeKey: string
  preferredGranularity: 'fine' | 'coarse' | 'by_function' | null
  avgSubtaskCount: number
  avgSubtaskDurationMin: number
  preferenceNotes: string[]      // learned, e.g. "removes generic 'read the prompt' step",
                                 //               "splits writing into research/outline/draft/edit"
  styleExemplars: AcceptedBreakdown[]   // last 1 to 3 ACCEPTED (post-edit) breakdowns, verbatim
  completionFidelity: number     // 0..1, how often generated steps were used as written
  lowFidelityPatterns: string[]  // patterns that get restructured a lot -> bias away from them
}
```
Plus a single cross-type `GeneralBreakdownProfile` per user ("prefers concise action-verb steps, no filler, durations on the short side") used when a specific type profile is thin or absent.

### 2.2 The learning loop (how the store updates)
Every breakdown the user touches produces signal:

1. **Capture the diff.** When the user edits a generated breakdown and saves, compute the diff between generated and accepted: renames, reorders, splits, merges, deletions, additions, duration changes.
2. **Summarize the diff into preferences.** Do this rule-based first (cheap and deterministic) for the common operations:
   - Deleted a near-duplicate of a generated step -> add "tends to remove {pattern} steps".
   - Split one step into N -> raise granularity toward `fine` for this type.
   - Merged N into one -> raise toward `coarse`.
   - Shortened/lengthened durations -> adjust avgSubtaskDurationMin (EWMA).
   - Reordered consistently -> learn the preferred ordering shape.
   Optionally run a small async LLM consolidation pass nightly to turn many raw signals into a few clean `preferenceNotes` and keep the store compact and high-signal.
3. **Update style exemplars.** Store the accepted (post-edit) breakdown as a new `styleExemplar` (FIFO, keep the most recent 1 to 3 for the type).
4. **Track completion fidelity.** As the user works the task, record for each generated subtask whether it was completed as written, edited first, or skipped. Update `completionFidelity` and add recurring restructure patterns to `lowFidelityPatterns`.
5. **Refine instructions are signal too.** A `Refine` instruction ("break coding tasks down by function") is converted directly into a durable preference for that type (here: `preferredGranularity = by_function`).

### 2.3 Retrieval at breakdown time
On `Break it down`: classify -> fetch `BreakdownMemory[taskTypeKey]` (or nearest by embedding) -> inject `preferenceNotes` + granularity + `avgSubtaskCount/Duration` as `USER_PROFILE`, and the `styleExemplars` as `USER_EXAMPLES`. If the type is new, fall back to `GeneralBreakdownProfile` and start learning. Pass `lowFidelityPatterns` as "avoid these shapes".

### 2.4 Privacy and storage
Memory is the user's own data, stored local-first (MMKV) and synced minimally to Supabase so it is available when breakdown runs server-side (for Claude/MCP, see `08`). No cross-user training. No raw assignment content is shared between users. The store is small (a few KB per task-type), so retrieval is instant and cheap.

### 2.5 Worked examples

**Example A, a chemistry lab with specific steps (grounding does the work).**
The user attaches the lab handout (7 numbered procedure steps). The breakdown reads the real steps and mirrors them as subtasks in order, with a concrete First move ("gather your goggles, gloves, and the handout"), rather than inventing generic "do the lab" steps. Accuracy comes from the source, not a guess.

**Example B, a Python assignment (memory does the work over time).**
First time, the model produces a generic 5-step breakdown. The user reorganizes it function-by-function and adds "write tests". The diff teaches `preferredGranularity = by_function` and a `preferenceNote` "include a tests step", and stores the accepted breakdown as an exemplar. Next coding task, the breakdown comes out by function with a tests step already, with little editing needed.

**Example C, essays (style and pruning).**
The user always deletes "read the prompt" and always splits "write" into research/outline/draft/edit. After two essays, the memory holds that pattern, and new essay breakdowns arrive in that shape, in the user's own phrasing, because their accepted breakdowns are the few-shot examples.

---

## Part 3: How subtasks behave inside a task (the semantics)

This resolves the ambiguity in the prior PRD (which once implied subtasks schedule individually and elsewhere said a broken task is one block). The model below is the single source of truth.

### 3.1 The core decision: the schedulable unit is the TASK, not the subtask
Subtasks are an ordered execution checklist inside a task. The engine schedules the task (as one block, or several split sessions), not each subtask as its own calendar block. This keeps the calendar clean and avoids over-constraining the user's minute-to-minute work. An optional power toggle `Schedule subtasks separately` (off by default) exists for the minority who want each subtask time-boxed.

Rationale across perspectives: ADHD execution wants one clear "next step", not 8 tiny calendar blocks to manage. Calendar legibility wants one block per work session. The engine wants to place total time efficiently, not solve a sub-block packing problem. FlowSavvy similarly treats decomposition and scheduling as separate concerns.

### 3.2 Duration rollup
When a task has subtasks, the task's effective `durationMin` = sum of subtask `estimatedMin`, kept in sync on every subtask edit. A manually set duration is overridden when subtasks exist (the app notes this). The First move's time is not added to the total (it is the first slice of the first subtask).

### 3.3 Progress mapping (this connects subtasks to scheduling)
Completing subtasks advances the task's `progressMin` = sum of completed subtasks' `estimatedMin`. On the next recompute, only the remaining duration is scheduled (partial completion, PRD FR-18). Example: a 60-min task with 5 subtasks, finish 2 worth 25 min, and the engine schedules the remaining 35 min. So working subtasks naturally shrinks the scheduled block over time.

### 3.4 The "current step" surfacing
At any moment a task exposes its next uncompleted subtask. This drives:
- Today: the First move card (before start) then the next subtask.
- Focus session: the large current-step text.
- Blindfold: the single shown micro-step.
- Notifications: "Start with: {next subtask}".

### 3.5 Completion rollup
Completing all subtasks completes the task. Marking the task complete directly marks all remaining subtasks complete. Either path sets `completedAt`.

### 3.6 Splitting vs subtasks are orthogonal
- Splitting decides how the total time is spread across the calendar (session sizes from min/max block and workload distribution).
- Subtasks decide how the work is decomposed for execution.
A 6-hour essay can be 4 subtasks AND 3 two-hour sessions. Sessions do not have to align to subtask boundaries. The user works the next uncompleted subtasks in whatever session they are in. Optional heuristic: try to start sessions on subtask boundaries when it does not hurt packing.

### 3.7 Calendar rendering
A task with subtasks renders as one block per session, labeled with the task title, an `N steps` chip, and a progress fill. Tapping opens the task with the subtask checklist. Subtasks do not each get a calendar block (unless `Schedule subtasks separately` is on). Split sessions at different times render as separate blocks of the same task.

### 3.8 Editing and re-breakdown
- Adding, removing, reordering, or resizing subtasks updates the parent duration and triggers a debounced recompute.
- Re-running `Break it down` replaces the subtask list. If progress exists, confirm first ("You have progress on this. Replace the steps?") and preserve completed-equivalent progress where possible.
- `Make easier` re-simplifies a single subtask without touching the rest.

### 3.9 Recurrence and subtasks
A recurring task carries a subtask template. Each occurrence starts with a fresh copy of the template (all unchecked). Optional per-occurrence AI regeneration for tasks whose steps change each time. Completing one occurrence does not affect the next.

### 3.10 Stakes and subtasks
A stake's completion condition can be the First move, a specific subtask, or the whole task (already in the model). So a user can lock apps until "outline done", not only until the entire task is done. Lock-until-I-start maps to the First move.

### 3.11 Edge cases
- Subtasks sum to less/more than a prior manual estimate: subtasks win; parent duration = sum.
- A subtask is huge (over max block): the splitting algorithm still splits the parent by min/max block across sessions; the subtask is just a checklist item that may span sessions.
- Zero subtasks: the task schedules by its own duration with the First move as the only starter.
- Partial work inside one subtask: progress is counted at subtask granularity (completed subtasks only) to keep it simple; a future option can allow manual mid-subtask progress.

### 3.12 Data relationships (summary)
```
Task (schedulable, has durationMin = sum of subtasks)
 ├── StarterAction "First move" (2 to 5 min, the smallest start)
 ├── Subtask[] (ordered checklist; estimatedMin; completedAt)
 ├── ScheduledBlock[] (one per session; engine-placed; pinnable)
 └── progressMin = sum(completed subtasks' estimatedMin) -> drives partial scheduling
```

---

## Part 4: New requirements this adds (fold into the PRD)
- FR-70 Breakdown memory system per Part 2 (per-user, per-task-type store; learning loop; retrieval; local-first; no cross-user training).
- FR-71 Subtask semantics per Part 3 (task is the schedulable unit; duration rollup; progress mapping; current-step surfacing; completion rollup; orthogonal splitting; one-block rendering; optional `Schedule subtasks separately`).
- FR-72 The breakdown and memory modules run both on-device and server-side (shared, so they work identically from the app and from Claude via MCP). See `08`.
