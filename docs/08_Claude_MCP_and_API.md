# Ampora — Technical Spec: Claude Connection (MCP), Public API, and the Portable Engine

> How Ampora connects to Claude the way FlowSavvy does, so a user can manage their tasks and schedule by talking to Claude, with the full set of task abilities (create, edit, break down, schedule, recalculate, recover). Companion to `01_PRD.md`. No em dashes, no semicolons.
>
> FlowSavvy ships a public API and an MCP server that let AI assistants and external tools interact directly with a user's tasks and schedule. Ampora matches that surface and adds breakdown, stakes configuration, and the focus profile.

---

## 1. The key architectural decision: one portable engine

The scheduling engine, the breakdown engine, and the memory system must run in two places: on the device (for instant local recompute) and on a server (because Claude is not on the device, so MCP and API calls run server-side).

Decision: build the engine and breakdown/memory logic as **one pure, deterministic TypeScript module with no platform dependencies and no I/O**. It takes inputs (tasks, events, settings, signals, memory) and returns outputs (placed blocks, subtasks). It is packaged once and imported by both the React Native app and the Supabase Edge Functions.

Why this works: the engine is already required to be deterministic and churn-minimizing (PRD NFR-2), so the same inputs produce the same schedule no matter where it runs. The device runs it for offline, instant recompute. The server runs it when Claude or the API changes something. Sync reconciles the two. No logic is duplicated and no behavior diverges.

```
packages/
  engine/        # pure TS: scheduling + splitting + ordering (deterministic, no I/O)
  breakdown/     # pure TS: prompt assembly + validation + memory retrieval/update
app/             # React Native (imports engine + breakdown, runs locally)
functions/       # Supabase Edge Functions + MCP server (import engine + breakdown, run server-side)
```

When Claude adds a task via MCP, the server writes the task, runs the engine, writes the resulting blocks, and the device picks them up on next sync. When the device is offline and the user adds a task, the device runs the engine locally and syncs later. Identical results.

---

## 2. The MCP server (connect Ampora to Claude)

### 2.1 What it is
A hosted MCP server (a Supabase Edge Function or a small Node service) exposing Ampora's task and schedule abilities as MCP tools over the standard MCP transport (HTTP with SSE, the same approach FlowSavvy uses). A user adds Ampora as a connector in Claude (Claude.ai, Claude Desktop, or Claude Code) and can then manage their schedule in natural language.

### 2.2 Authentication
- **Preferred: OAuth connector flow.** The user clicks Connect in Claude, authorizes Ampora, and a scoped token is issued tied to their Ampora account. Standard for consumer MCP connectors.
- **Alternative: personal API key.** Generated in Ampora Settings, pasted into the connector config. Simpler to ship first.
- All tools operate only on the authenticated user's own data. Tokens are scoped and revocable in Settings.

### 2.3 The tool surface (the abilities)
Full parity with a best-in-class scheduler plus Ampora extras. Each tool validates inputs and returns structured results.

**Tasks**
- `create_task` (all fields: title, notes, list, tags, priority, autoSchedule, durationMin, dueAt, startAfter, schedulingHoursId, splittable, minBlockMin, maxBlockMin, buffers, recurrence, dependsOn, energyRequired, color, sourceMaterial)
- `update_task` (any field by id)
- `delete_task`
- `complete_task` and `set_task_progress` (progressMin or percentage)
- `get_task`, `list_tasks` (filters: list, tag, priority, due range, scheduled/unscheduled, has-stake, completed)
- `break_down_task` (runs the breakdown engine with grounding + memory; optional inline source; returns First move + subtasks)
- `refine_breakdown` (taskId + instruction -> regenerated subtasks)
- `add_subtask`, `update_subtask`, `complete_subtask`, `reorder_subtasks`, `delete_subtask`

**Events**
- `create_event`, `update_event`, `delete_event`, `list_events`

**Schedule**
- `get_schedule` (date range -> placed blocks with times)
- `rebuild_schedule` (full recompute, the "Rebuild schedule" button)
- `recovery_replan` (the "Catch me up" reprioritize-and-rebuild)
- `reschedule_block` (pin a task's block to a specific time)

**Organization**
- `create_list`, `list_lists`, `update_list`, `delete_list`
- `list_tags`
- `list_scheduling_hours`, `get_settings` (read), `update_setting` (safe subset)

**Stakes (read and configure only, never remote-trigger a device lock)**
- `list_stake_apps` (count and labels only; iOS tokens are opaque)
- `attach_stake` (set a task's stake config: mode, completion condition, strength within caps)
- `list_stake_sessions` (history/outcomes)
Note: actually shielding apps happens on-device with the user present (PRD Section 14 and `06`). Claude can configure a stake on a task, but the lock engages when the user starts the session on their device. This is a safety boundary: no remote, surprise lock.

**Learning**
- `get_focus_profile` (read Focus DNA: best windows, estimation multipliers, dodged types)

### 2.4 Example interactions
- User to Claude: "Add my chem lab due Friday at 5, it'll take 2 hours, and break it into steps." Claude calls `create_task` then `break_down_task`. Ampora grounds on any attached handout and applies the user's memory. The task and its subtasks appear in the app on sync.
- "Rebuild my week, I got behind." Claude calls `recovery_replan`. The server runs the engine, reprioritizes, returns the new schedule, and the device updates.
- "What's on my plate tomorrow?" Claude calls `get_schedule` for tomorrow and reads back the blocks.
- "Make my essay tasks break down by outline-first." Claude calls `refine_breakdown` or sets a preference, which the memory system records for that task-type.

### 2.5 Breakdown and memory over MCP
Because breakdown and memory are the shared server-capable modules (Section 1), `break_down_task` over MCP uses the exact same grounding and the same per-user memory as the in-app button. So personalization persists no matter where the user works, the app or Claude.

`break_down_task` also accepts an optional `externalContext` string. When Claude triggers a breakdown, it can pass what it knows about the user and the exact task (their real class, the assignment they were just discussing, their skill level, past struggles) as additional grounding, layered on top of the local breakdown memory and any attached source. This is the "Claude knows more about you" channel (doc `07` Part 1C.6). It is the user's own Claude and their own data, and it is optional, the default in-app path uses local memory and source only.

### 2.6 Sync back to device
All MCP writes go through the same Supabase data layer the app syncs with, so changes Claude makes show up in the app (and the reverse) via the existing last-write-wins sync with a conflict log (PRD 9.12).

---

## 3. Public API (for scripts and external tools)
A REST or GraphQL API exposing the same operations as the MCP tools, authenticated by API key (generated in Settings, scoped, revocable). The MCP server is a thin MCP wrapper over this same service layer, so there is one implementation of each operation. Rate-limited per key. Documented with examples. This mirrors FlowSavvy offering both a public API and an MCP server.

---

## 4. BYO model key (separate from MCP, complementary)
Two different "Claude" connections exist and should not be confused:
1. **MCP server (this doc):** lets Claude control Ampora. The FlowSavvy-style integration.
2. **BYO model key (PRD FR, optional):** Ampora uses the user's own Claude or ChatGPT key to power the breakdown engine for higher quality and no shared quota. This affects how breakdowns are generated, not how Claude controls the app. The default breakdown path works with no key.

A user can use either, both, or neither.

---

## 5. Security, permissions, limits
- Tokens and API keys are scoped to one account, revocable, and never grant access to another user's data.
- Stakes cannot be remotely engaged (Section 2.3). No tool can disable the wellbeing caps or the never-lock list.
- Rate limits per token/key. Audit log of MCP/API writes available to the user.
- Secrets (model keys, OAuth secrets) live in Edge Function config, never in the client.
- The same privacy rules apply (NFR-4): no selling data, no cross-user training, behavioral and breakdown data stay the user's own.

---

## 6. New requirements this adds (fold into the PRD)
- FR-73 MCP server exposing the full task/event/schedule/breakdown/focus surface to Claude, with OAuth or API-key auth, operating only on the authenticated user's data, with stakes limited to read/configure (no remote lock).
- FR-74 Public API (REST or GraphQL) with the same operations, API-key auth, rate-limited.
- FR-75 The engine and breakdown/memory modules are packaged as pure portable TypeScript and run both on-device and in Edge Functions, so app and Claude produce identical results.
