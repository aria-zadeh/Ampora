# Ampora — Technical Spec: Projects

> Ampora has two first-class work types. Tasks (short, 1 to 2 days, spec in `07`) and Projects (ongoing or large, with their own files, chat, and memory, spec here). A Project is a scoped AI workspace for one academic endeavor that also generates the day-to-day Tasks you schedule and lock against. Companion to `01_PRD.md`, `07`, `08`, `09`. No em dashes, no semicolons.
>
> Framing: Ignition (locking apps against a goal) is still the main feature. A Project's job is to always hand you a sensible, achievable next Task to start and lock against, even when the overall thing is huge. The Project is the knowledge and chat layer. The generated Tasks are what Ignition acts on.

---

## 1. Tasks vs Projects (the split)

| | Task | Project |
|---|---|---|
| Size | Short, 1 to 2 days | Large or ongoing, often recurring |
| Examples | A problem set, an essay, a reading | A research paper, "Study for SciOly Remote Sensing", a semester unit |
| Files | Optional source attached to the task | A persistent library of multiple files that stay in the project |
| Interface | Form plus AI breakdown | A chat you talk to like an assistant, plus the task list it generates |
| Progress | Subtask completion | Phases or topic coverage plus mastery, tracked over time |
| Memory | Per-task-type breakdown memory | Full project memory: decisions, coverage, your style, your weak spots |
| Output | Itself (you do it) | Generates the daily Tasks you schedule and lock against |

A user creates a Project explicitly (not auto-detected by size, which was the prior approach and is replaced by this clearer model).

---

## 2. What a Project is

A Project is an ongoing workspace with five capabilities:
1. **A persistent knowledge base** of uploaded files it understands.
2. **A conversational interface** you talk to like any AI chatbot.
3. **Progress awareness**, so it knows how far along you are.
4. **Learning over time**, so it adapts to you.
5. **Task generation**, so it produces the concrete sessions you schedule and lock.

---

## 3. Project types (shape progress and "what to do next")

- **Deliverable** (a research paper, a big assignment): linear-ish phases (narrow topic, sources, notes, outline, draft, revise, finalize), a percent complete, and usually a due date.
- **Study** (Study for SciOly Remote Sensing, exam prep): a topic or coverage map with a mastery and confidence level per topic, updated as you study and from quiz performance. Ongoing or recurring, often with a target date (a competition or exam). Progress is coverage plus mastery, not a single line.
- **General or ongoing:** flexible, for work that does not fit the other two.

The type is chosen at creation (with a sensible default the chat can change later). It determines how progress is measured and how the next task is chosen.

---

## 4. The knowledge base (files that stay)

- Upload multiple files that persist in the project: PDFs, slide decks, notes, images, screenshots. Add or remove anytime.
- On upload, each file is ingested: extract text (OCR for images and screenshots), chunk it, and embed the chunks for retrieval. Small corpora can be passed as direct context; larger ones use retrieval (RAG) so the relevant parts are pulled when needed.
- The project understands all the files collectively. When it generates a task, answers a chat question, or makes a quiz, it retrieves the relevant chunks across every file.
- Example: for "Study for SciOly Remote Sensing" you upload the rules manual, study guides, past tests, and your notes. The project can then generate study sessions, explain a concept, and quiz you from that material.

---

## 5. The conversational interface (talk to it like a chatbot)

Every project has a chat scoped to it. This is the primary way to manage a project, and the universal repair mechanism. If the plan or a breakdown is wrong, you do not fiddle with forms, you tell the chat and it fixes everything.

The project chat has access to: the project's files (via retrieval), the project's current plan, tasks, and progress, and the project memory. It can both answer and act.

Things you can say:
- "What should I do today?" -> it proposes the next session task based on where you are.
- "I finished the sources, what next?" -> it updates progress and proposes the next step.
- "I changed my topic to X, redo the plan." -> it regenerates the phases and pending tasks.
- "Quiz me on the electromagnetic spectrum." -> it generates questions from the files and updates mastery from your answers.
- "Explain how passive vs active sensors differ." -> it answers from the uploaded material.
- "This breakdown is too granular, make it three steps." -> it regenerates that task's breakdown.
- "I have less time this week, lighten the plan." -> it rebalances the remaining work.

Under the hood the chat can call the same internal actions the app uses: create or modify or reschedule the project's tasks, regenerate a breakdown or the phase or topic plan, update progress or mastery, add or reference files. So the chat is a controller, not just a Q and A box. This is what makes "if it messes up, just message it and it fixes everything" true.

---

## 6. Progress awareness

- **Deliverable projects:** phase completion plus a percent done. The current phase plus partial progress within it is the position.
- **Study projects:** a coverage map (which topics you have touched) plus a mastery and confidence level per topic, updated from your self-report and from quiz performance. The project knows what is left and what is weak.
- The project always knows "where you are", which drives the next task. This is also how it adjusts the first or next task by how far along you are: a paper at 40 percent proposes drafting section 2, and SciOly studying proposes the weakest uncovered topic next.

---

## 7. Suggesting the first or next task (the dynamic part)

Based on progress, the project proposes the next concrete session and generates it as a real Task:
- Research paper at 40 percent: "Draft section 2 (90 minutes)", with a First move of "open your draft and write the section heading".
- Study for SciOly Remote Sensing: "Review the EM spectrum basics, then do 10 practice image-ID questions (45 minutes)", prioritizing weak or uncovered topics.

The generated Task is a normal Ampora Task: schedulable, with a First move and subtasks (doc `07`), carrying a back-reference to the project. It flows into the scheduler and can have a stake attached. The First move is always computed for the current session, never the whole project (the fix from `07` Part 1D), so it is always small and determinable.

---

## 8. Learning over time

A project remembers, within its scope:
- Decisions (the chosen topic, the scope, what has been covered).
- Your style and preferences (how you like work broken down, outline-first, and so on), via the per-project breakdown memory (`07` Part 2).
- Your weak spots (you keep missing the remote-sensing math, so it emphasizes that and revisits it).
This memory is the user's own data, local-first and synced minimally, and is never used to train a shared model.

---

## 9. How Projects feed the scheduler and Ignition

- Projects generate Tasks. Tasks are what the scheduler places and what Ignition locks against.
- You never lock apps "until the research paper is done", which is impossible in a sitting. You lock against today's generated session task (its First move, its steps, or a focus-time block), verified per doc `09`.
- So the Project is the knowledge plus chat plus progress layer, and the generated daily Tasks are the concrete, schedulable, lockable units. This keeps Ignition at the center.

---

## 10. The self-healing principle

Because a project is conversational and everything it produces is editable, mistakes are cheap. A bad plan, a wrong breakdown, a changed topic, all are fixed by messaging the project, which regenerates the affected plan and tasks. There is no rigid wizard to get stuck in. This lowers the cost of the AI being imperfect, which matters because breakdown is good for general work and weaker for highly specific work (`07` Part 1.0).

---

## 11. Relationship to the Claude connection

The in-app project chat and the external Claude connection (doc `08`) are two front-ends to the same project-scoped assistant and the same tools. The connected Claude can read a project's files and state and suggest or create the next task via MCP, and it can supply outside context it knows about you (`07` Part 1C.6). A user can manage a project from inside Ampora or from Claude, and they stay in sync.

---

## 12. Data model

```ts
type Project = {
  id: string;
  title: string;                 // e.g. "Study for SciOly Remote Sensing"
  type: 'deliverable' | 'study' | 'general';
  deadline?: number;             // due date or target date (competition/exam)
  recurrence?: RecurrenceRule;   // for ongoing/recurring projects
  files: ProjectFile[];
  phases?: Phase[];              // deliverable projects
  topics?: Topic[];              // study projects
  progress: ProjectProgress;     // percent and/or coverage+mastery
  memory: ProjectMemory;         // decisions, style, weak spots
  chatHistory: ChatMessage[];
};

type ProjectFile = {
  id: string; projectId: string;
  fileUri: string;               // stored file (Supabase storage)
  extractedText: string;         // OCR/extraction result
  index?: EmbeddingRef;          // chunk embeddings for retrieval
  addedAt: number;
};

type Phase = { id: string; title: string; estimateMin: number; status: 'todo'|'doing'|'done'; order: number };
type Topic = { id: string; title: string; coverage: number; mastery: number };  // 0..1

// Generated Tasks reference the project
// Task.projectId?: string   (add to the Task type in 01 Section 4 / v1 model)
```

---

## 13. Build phasing

Projects are a later milestone. Build the core first: Tasks, the scheduling engine, the calendar, Ignition, and Task-level breakdown (PRD Milestones 1 to 5). Add Projects after, since they layer on top of Tasks (a project just generates Tasks) and add the file knowledge base, the chat, and progress tracking. The knowledge base (RAG over files) and the project chat with tool use are the two heavier pieces and can ship incrementally (files and chat first, mastery and quizzing later).

---

## 14. New requirements (fold into the PRD)
- FR-82 Projects are a first-class type distinct from Tasks, created explicitly, with a persistent multi-file knowledge base the AI understands (RAG over uploaded files that stay).
- FR-83 Each project has a scoped conversational interface that can both answer (from the files and state) and act (create, modify, reschedule, regenerate the project's tasks, plan, and breakdowns). It is the primary controller and the universal repair mechanism.
- FR-84 Projects track progress (phases plus percent for deliverables, topic coverage plus mastery for study projects) and generate the next session as a normal schedulable, lockable Task whose First move is computed for the current position.
- FR-85 Projects learn over time within their scope (decisions, style, weak spots), local-first, no shared-model training.
- FR-86 Projects feed the scheduler and Ignition by generating Tasks; stakes lock against the generated session task, never the whole project.
