/**
 * Pure calendar overlap layout (PRD §9.8, FR-25).
 *
 * PORTABILITY: no react-native / expo imports. Pure, deterministic, and
 * unit-testable in plain Node — same discipline as `core/scheduler/`.
 *
 * Algorithm (PRD §9.8 "interval graph"):
 *  1. Sort items by start (then end, then a stable tiebreak) so the sweep is
 *     deterministic.
 *  2. Walk left to right building CLUSTERS: a maximal run of items where each
 *     item overlaps at least one already-open item (connected component of the
 *     interval graph). A new item that starts at/after every open item's end
 *     closes the current cluster and starts a fresh one.
 *  3. Within a cluster, assign each item the FIRST FREE COLUMN via a sweep
 *     (greedy graph coloring on an interval graph = optimal). The cluster's
 *     column count is the max concurrency seen.
 *  4. Fractional geometry: width = 1 / cols, x = colIndex / cols (both 0..1),
 *     so the view multiplies by the available content width. Column count is
 *     per-cluster, so a lone block downstream of a busy cluster still renders
 *     full width.
 *
 * Fixed events may be biased to the leftmost column (PRD §9.8 "Fixed events may
 * take priority column 0") via {@link LayoutOptions.eventsFirst}, defaulting on.
 */

/** Anything with an absolute [start, end) span on the timeline (epoch ms). */
export interface TimeSpanItem {
  id: string
  /** Epoch ms, inclusive. */
  start: number
  /** Epoch ms, exclusive. */
  end: number
  /**
   * Optional kind hint. When {@link LayoutOptions.eventsFirst} is on, `'event'`
   * items are ordered ahead of tasks inside a cluster so a fixed event tends to
   * hold the leftmost column.
   */
  kind?: 'task' | 'event'
}

/** One item's resolved horizontal placement within its overlap cluster. */
export interface LaidOutItem<T extends TimeSpanItem> {
  item: T
  /** 0-based column index within the cluster. */
  colIndex: number
  /** Total columns in this item's cluster (>= 1). */
  cols: number
  /** Fractional left offset in 0..1 (`colIndex / cols`). */
  xFraction: number
  /** Fractional width in 0..1 (`1 / cols`). */
  widthFraction: number
  /** 0-based index of the cluster this item belongs to (stable, in time order). */
  clusterIndex: number
}

/** Options for {@link layoutDay}. */
export interface LayoutOptions {
  /**
   * Bias `kind: 'event'` items toward column 0 within each cluster
   * (PRD §9.8). Default `true`. Purely an ordering preference; never changes
   * the column COUNT, only which item lands in which column.
   */
  eventsFirst?: boolean
}

/** Effective end used for overlap tests: guarantees a zero-length item still occupies a sliver so it gets a column. */
function effectiveEnd(item: TimeSpanItem): number {
  return item.end > item.start ? item.end : item.start + 1
}

/**
 * Two half-open spans overlap iff each starts before the other ends. Touching
 * spans (a.end === b.start) do NOT overlap — they render full width, stacked.
 * Exported for view-side hit-testing / drag-collision checks.
 */
export function spansOverlap(a: TimeSpanItem, b: TimeSpanItem): boolean {
  return a.start < effectiveEnd(b) && b.start < effectiveEnd(a)
}

/**
 * Lay out a single day's items into non-overlapping columns (PRD §9.8).
 *
 * Deterministic: equal-start ties break by end, then by the `eventsFirst`
 * bias, then by `id` so the result is stable across recomputes (matches the
 * scheduler's churn-minimizing contract).
 *
 * @returns one {@link LaidOutItem} per input, in input-independent sorted order.
 */
export function layoutDay<T extends TimeSpanItem>(
  items: T[],
  options: LayoutOptions = {}
): LaidOutItem<T>[] {
  const eventsFirst = options.eventsFirst ?? true

  const sorted = [...items].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start
    if (eventsFirst) {
      const ae = a.kind === 'event' ? 0 : 1
      const be = b.kind === 'event' ? 0 : 1
      if (ae !== be) return ae - be
    }
    if (a.end !== b.end) return a.end - b.end
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  })

  const result: LaidOutItem<T>[] = []

  // A cluster in progress: the items placed so far and, per column, the max end
  // seen (so a new item can reclaim a column whose occupant has finished).
  let clusterIndex = -1
  let clusterItems: { laid: LaidOutItem<T>; end: number }[] = []
  let columnEnds: number[] = [] // columnEnds[c] = latest end currently occupying column c

  const flushClusterCols = () => {
    // Backfill the true column count onto every item in the just-finished cluster.
    const cols = columnEnds.length || 1
    for (const entry of clusterItems) {
      entry.laid.cols = cols
      entry.laid.xFraction = entry.laid.colIndex / cols
      entry.laid.widthFraction = 1 / cols
    }
  }

  for (const item of sorted) {
    const end = effectiveEnd(item)

    // Does this item still overlap the OPEN cluster? It does iff it starts
    // before the max end of anything currently open. We track that as the max
    // of columnEnds (the cluster's right frontier).
    const clusterFrontier =
      columnEnds.length === 0 ? -Infinity : Math.max(...columnEnds)

    const startsNewCluster =
      clusterItems.length === 0 || item.start >= clusterFrontier

    if (startsNewCluster) {
      // Close the previous cluster (assign real column counts) and open a new one.
      if (clusterItems.length > 0) flushClusterCols()
      clusterIndex += 1
      clusterItems = []
      columnEnds = []
    }

    // First free column: the lowest-indexed column whose occupant has ended
    // by this item's start. Reuse it; otherwise open a new column.
    let colIndex = -1
    for (let c = 0; c < columnEnds.length; c++) {
      if (item.start >= columnEnds[c]) {
        colIndex = c
        break
      }
    }
    if (colIndex === -1) {
      colIndex = columnEnds.length
      columnEnds.push(end)
    } else {
      columnEnds[colIndex] = end
    }

    const laid: LaidOutItem<T> = {
      item,
      colIndex,
      cols: columnEnds.length, // provisional; finalized in flushClusterCols
      xFraction: 0,
      widthFraction: 1,
      clusterIndex,
    }
    clusterItems.push({ laid, end })
    result.push(laid)
  }

  if (clusterItems.length > 0) flushClusterCols()

  return result
}

/**
 * Convenience: group laid-out items by their cluster index. Handy for a view
 * that wants to render or measure clusters independently.
 */
export function groupByCluster<T extends TimeSpanItem>(
  laid: LaidOutItem<T>[]
): LaidOutItem<T>[][] {
  const groups: LaidOutItem<T>[][] = []
  for (const l of laid) {
    ;(groups[l.clusterIndex] ??= []).push(l)
  }
  return groups
}
