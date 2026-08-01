# Ampora — Projects

> Ampora has two first-class work types. Tasks (short, 1 to 2 days, spec in `03`) and Projects (large or ongoing, spec here). A Project exists so that multi-day work has structure and always hands you a sensible, achievable session to schedule and lock against, even when the whole thing is huge. Companion to `01_PRD.md` (FR-82 to FR-85) and `04`. No em dashes, no semicolons.
>
> Framing: Ignition is still the main feature. A Project's only job is to generate one good, lockable Task per day. There is no file library and no project chat at launch (both are deferred, see `V2_Changes.md`). The generated Tasks are what the scheduler places and Ignition acts on.

---

## 1. Tasks vs Projects (the split)

| | Task | Project |
|---|---|---|
| Size | Short, 1 to 2 days | Large or ongoing, often recurring |
| Examples | A problem set, an essay, a reading | A research paper, "Study for SciOly Remote Sensing", a semester unit |
| Structure | Subtasks plus a First move | An ordered phase list plus a one-line context field |
| Interface | Task editor plus AI breakdown | The same, one level up; edited like a breakdown |
| Progress | Subtask completion | Percent bar (completed phases plus fraction of the current phase) |
| Output | Itself (you do it) | Generates one schedulable, lockable Task per day |

A user creates a Project explicitly, not auto-detected by size.

---

## 2. What a Project is (four small things, no files needed)

The original design had a per-project knowledge base and an AI chat. Both are deferred. A Project at launch needs only four things it already has, and that is enough to generate a good daily session:

1. **A phase list, made at creation.** The user creates the project from one line ("AP Gov research paper, due Nov 14") and picks a type (deliverable or study). The AI drafts an ordered phase list (for a deliverable: Research, Outline, Draft, Revise, Final; for a study project: the topic list). The user edits it exactly like a task breakdown. Same interaction, one level up. No new UI concepts.

2. **One optional context line.** A single text field, one paragraph maximum: "MLA format, topic is Cold War containment, 5 pages." This is not a file system and not a chat. It carries the specificity that stops generated sessions from being generic, which is 90 percent of what the knowledge base was for.

3. **Completion history.** The app already knows which sessions were completed and which subtasks were checked. That is the progress state, for free.

4. **A one-tap check-in when a session ends.** "Did you finish today's goal?" with three buttons: Done, Keep going, Stop here. Done advances progress; Keep going carries the remainder into the next session after a break; Stop here reflows the remainder. No conversation.

If a specific session needs real source material (a rubric, a problem set, a reading), the user pastes it on that day's task. Task-level source attachment (FR-7) makes project-level file storage unnecessary for launch.

---

## 3. Project types (shape progress and the next session)

- **Deliverable** (a research paper, a big assignment): ordered phases (Research, Outline, Draft, Revise, Final), a percent complete, usually a due date. The current phase plus partial progress within it is the position.
- **Study** (Study for SciOly Remote Sensing, exam prep): the phase list is the topic list. Progress is percent of topics completed. Per-topic mastery tracking is deferred to V2; at launch a topic is simply done or not.

The type is chosen at creation and determines how progress reads and how the next session is picked.

---

## 4. Session generation (the dynamic part)

Each night, during the pre-built-tomorrow pass (FR-90), every active project emits one normal Task for tomorrow. The breakdown engine receives:

- the current phase,
- the context line,
- the last session's outcome (from the check-in, or inferred from subtask checkboxes if the check-in was skipped),
- tomorrow's available block length.

It returns a session goal, subtasks, and a First move computed from where the user actually is now, not the whole project. A research paper at the Draft phase generates "Draft section 2 (90 min)" with a First move of "open your draft and reread your last paragraph". The First move is always small and determinable because it is relative to current progress, even when the overall project is vague.

The generated Task is a normal Ampora Task: schedulable, with a First move and subtasks (`03`), carrying a back-reference to the project (`Task.projectId`). It flows into the scheduler and can have a stake attached.

---

## 5. Progress and the check-in

- Progress is a simple percent bar: completed phases plus the fraction of the current phase.
- The session's end check-in (Done / Keep going / Stop here) is the progress input. Done marks the session goal complete and may advance the phase; Keep going starts the next session after a break; Stop here reflows the remainder into the schedule.
- If the check-in is skipped, progress is inferred from which subtasks got checked, so a skipped check-in never stalls tomorrow's generation.

---

## 6. How Projects feed the scheduler and Ignition

- Projects generate Tasks. Tasks are what the scheduler places and what Ignition locks against.
- You never lock apps "until the research paper is done", which is impossible in a sitting and is explicitly disallowed (the `until_done` hold is never offered against a whole project, `04` Section 2). You lock against today's generated session task, held for the session and verified per `04`.
- The Project is the thin structure-and-progress layer; the generated daily Tasks are the concrete, schedulable, lockable units. Ignition stays at the center.

---

## 7. Editing and deletion

- The phase list and context line are editable at any time. Editing a phase does not disturb already-completed sessions.
- A task belongs to at most one project (one project per task), which keeps progress attribution unambiguous.
- Deleting a project keeps and unlinks its generated tasks by default; the confirm dialog offers "also delete tasks". Deletion never silently destroys scheduled work.

---

## 8. What is deferred

The project file library, the project chat, and study-project mastery tracking are out of scope for launch. See `V2_Changes.md` for the full list and revival order.

---

## 9. Data model

```ts
type Project = {
  id: string;
  title: string;                 // e.g. "Study for SciOly Remote Sensing"
  kind: 'deliverable' | 'study';
  deadline?: number;             // due date or target date
  contextLine?: string;          // one paragraph, optional
  phases: Phase[];               // ordered; for study projects this is the topic list
  percent: number;               // completed phases + fraction of current
};

type Phase = { id: string; title: string; done: boolean; order: number };

// Generated Tasks reference the project:
// Task.projectId?: string   (defined in 01 Section 9.4)
```

---

## 10. Build phasing

Projects are a later milestone. Build the core first: Tasks, the scheduling engine, the calendar, Ignition sessions, and Task-level breakdown. Add Projects after, since a project just generates Tasks. The whole Projects surface at launch is: create-from-one-line, an editable phase list, a context line, a percent bar, the end check-in, and the nightly session generator. It is deliberately small.
