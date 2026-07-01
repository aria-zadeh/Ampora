/**
 * 9.5.2 Ordering + FR-10 comparator + FR-19 topological constraint.
 *
 * Eligibility (PRD §9.5.2):
 *   - autoSchedule === true
 *   - status !== 'done'
 *   - due within [now, cutoff]  (undated tasks handled separately — §9.5.11)
 *   - dependencies satisfiable (no missing / cyclic / done-blocking prereqs)
 *
 * Sort (FR-10 standard mode): priority DESC (Urgent=4 > High=3 > Med=2 > Low=1,
 * missing priority treated as Low=1), then earliest due ASC, ties by createdAt
 * ASC (deterministic).
 *
 * Then a topological pass (FR-19) reorders so every task appears AFTER all of
 * its `dependsOn` prerequisites, without otherwise disturbing the FR-10 order
 * more than necessary (stable Kahn's algorithm).
 *
 * Pure; deterministic.
 */

import type { Task } from '@/types'

/** Numeric priority with Low as the floor. Urgent(4) > High(3) > Med(2) > Low(1). */
export function priorityValue(task: Task): number {
  const p = task.priority ?? 1
  // Clamp defensively into 1..4.
  return Math.max(1, Math.min(4, p))
}

/** FR-10 comparator for standard mode. Returns <0 if `a` should come first. */
export function compareTasks(a: Task, b: Task): number {
  const pa = priorityValue(a)
  const pb = priorityValue(b)
  if (pa !== pb) return pb - pa // higher priority first
  // Earliest due first; undated sorts after dated (shouldn't co-occur in the
  // dated eligible list, but keep it total-order safe).
  const da = a.due ?? Number.POSITIVE_INFINITY
  const db = b.due ?? Number.POSITIVE_INFINITY
  if (da !== db) return da - db
  if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt
  // Final tiebreak on id for full determinism.
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * Whether a task's dependencies are SATISFIABLE for this planning run:
 * every id in `dependsOn` either is already done (prereq complete) or is
 * itself an eligible task that will be placed this run. A prereq that is
 * missing entirely (deleted) is ignored (treated as satisfied) rather than
 * blocking forever — FR-20 spirit (never silently strand a task on stale data).
 */
export function dependenciesSatisfiable(
  task: Task,
  byId: Map<string, Task>,
  eligibleIds: Set<string>
): boolean {
  if (!task.dependsOn || task.dependsOn.length === 0) return true
  for (const depId of task.dependsOn) {
    const dep = byId.get(depId)
    if (!dep) continue // deleted prereq → ignore
    if (dep.status === 'done') continue // satisfied
    if (!eligibleIds.has(depId)) return false // prereq not being placed this run
  }
  return true
}

/** A task is eligible if auto-scheduled, not done, and dated within the horizon. */
export function isDatedEligible(task: Task, now: number, cutoff: number): boolean {
  if (!task.autoSchedule) return false
  if (task.status === 'done') return false
  if (task.due == null) return false
  // Due within cutoff; overdue (due < now) is still eligible — it needs placing.
  return task.due <= cutoff
}

/**
 * Build the ordered, dependency-constrained task list (dated tasks only).
 * Undated auto-scheduled tasks are handled by the placement layer (§9.5.11).
 */
export function orderTasks(tasks: Task[], now: number, cutoff: number): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))

  // First pass: dated-eligible set (ignores dependency satisfiability, which
  // depends on the set itself).
  const datedEligible = tasks.filter((t) => isDatedEligible(t, now, cutoff))
  const eligibleIds = new Set(datedEligible.map((t) => t.id))

  // Second pass: keep only those whose deps are satisfiable within this set.
  const eligible = datedEligible.filter((t) =>
    dependenciesSatisfiable(t, byId, eligibleIds)
  )

  // FR-10 base sort.
  const sorted = [...eligible].sort(compareTasks)

  // FR-19 stable topological reorder (Kahn), preserving FR-10 order among
  // ready tasks. Edges: dep -> task for every dep that is in `eligible`.
  return topoSort(sorted, byId)
}

/**
 * Stable Kahn's topological sort. `sorted` is already in FR-10 order; we emit
 * tasks respecting dependsOn edges, always picking the FR-10-earliest ready
 * task. Cycles (should not happen given satisfiability filtering) are broken
 * by appending remaining tasks in FR-10 order so nothing is dropped (FR-20).
 */
function topoSort(sorted: Task[], byId: Map<string, Task>): Task[] {
  const inSet = new Set(sorted.map((t) => t.id))
  const indeg = new Map<string, number>()
  const dependents = new Map<string, string[]>() // dep -> tasks depending on it

  for (const t of sorted) {
    const deps = (t.dependsOn ?? []).filter((d) => inSet.has(d) && byId.get(d)?.status !== 'done')
    indeg.set(t.id, deps.length)
    for (const d of deps) {
      const arr = dependents.get(d) ?? []
      arr.push(t.id)
      dependents.set(d, arr)
    }
  }

  const result: Task[] = []
  const placed = new Set<string>()
  // Repeatedly scan `sorted` (FR-10 order) for the first ready+unplaced task.
  // O(n^2) worst case only in pathological deep chains; n here is #eligible
  // tasks, fine for hundreds. Deterministic and stable.
  let progressed = true
  while (result.length < sorted.length && progressed) {
    progressed = false
    for (const t of sorted) {
      if (placed.has(t.id)) continue
      if ((indeg.get(t.id) ?? 0) > 0) continue
      result.push(t)
      placed.add(t.id)
      progressed = true
      for (const dep of dependents.get(t.id) ?? []) {
        indeg.set(dep, (indeg.get(dep) ?? 0) - 1)
      }
    }
  }
  // Cycle fallback: append any leftover in FR-10 order (never drop — FR-20).
  if (result.length < sorted.length) {
    for (const t of sorted) if (!placed.has(t.id)) result.push(t)
  }
  return result
}

/**
 * Undated auto-scheduled tasks that the user has opted to "fit in when there is
 * space" (PRD §9.5.11). We surface them at the lowest priority, after all
 * dated work. Opt-in is modeled as `startAfter == null && due == null &&
 * autoSchedule` — with no dedicated flag in the model yet, the placement layer
 * treats these as backfill-only and never displaces dated work.
 *
 * Ordered by FR-10 among themselves (priority then createdAt).
 */
export function orderUndatedBackfill(tasks: Task[]): Task[] {
  const undated = tasks.filter(
    (t) => t.autoSchedule && t.status !== 'done' && t.due == null
  )
  return [...undated].sort(compareTasks)
}
