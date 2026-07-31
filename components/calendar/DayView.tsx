import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { router } from 'expo-router'
import {
  GestureHandlerRootView,
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  runOnJS,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useShallow } from 'zustand/react/shallow'

import type { ScheduledBlock, CalEvent, Task } from '@/types'
import {
  blockGeometry,
  pxPerMinFromHour,
  snapToGrid,
  instantForY,
  layoutDay,
  MS_PER_MIN,
  MIN_BLOCK_HEIGHT,
  type LaidOutItem,
  type TimeSpanItem,
} from '@/core/calendar'
import { startOfDay } from '@/core/scheduler/time'
import {
  useScheduleStore,
  selectBlocksByDay,
  selectEventsByDay,
} from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { EASINGS, DURATIONS, SPRINGS } from '@/utils/motion'
import { shadows, tabularNums } from '@/utils/design-tokens'
import { TimeGrid } from './TimeGrid'
import { CalendarBlock } from './CalendarBlock'
import { BlockActionSheet } from './BlockActionSheet'
import { EventActionSheet } from './EventActionSheet'
import { AddEventModal } from '@/components/ui/AddEventModal'
import { isSameDay, HOURS_IN_DAY, formatClockTime } from './hours'
import { AUTOSCROLL, autoscrollSpeed, type GridScrollController } from './gridScroll'

/** Snap granularity for drag-to-reschedule + resize (PRD FR-28: "snaps to a 5-min grid"). */
const SNAP_MIN = 5
/** Minimum block duration a resize can produce (minutes). Mirrors the 5-min snap. */
const MIN_DURATION_MIN = 5
/**
 * Movement (px) a long-press-drag must exceed before it counts as a real drag
 * (and therefore SUPPRESSES the release tap). Below this, a long-press that
 * ends without moving is treated as a tap and still opens the task.
 */
const DRAG_TAP_THRESHOLD_PX = 4
/**
 * Height (px) of each top/bottom edge resize hit-zone TOUCH TARGET (Round B
 * fix #8 — was 14px, too small to reliably grab). The visual grip stays a
 * thin 3px line; this only widens the invisible hit area around it, and it
 * only renders (any opacity above 0) on the active/lifted block so it adds no
 * visual noise at rest.
 */
const EDGE_ZONE_PX = 44
/** A block must be at least this tall (px) to expose resize edge-zones. */
const MIN_RESIZABLE_PX = 44
/** Lift scale at full pick-up (Round B fix #6: 1.02 -> 1.03, a touch more pop). */
const LIFT_SCALE = 0.03

/**
 * A time-grid item ready to lay out: either a scheduled task block or a fixed
 * calendar event. We tag `kind` so {@link layoutDay} biases events toward the
 * leftmost column (PRD §9.8), and keep the source so the renderer can pick the
 * right {@link CalendarBlock} props.
 */
type GridItem = TimeSpanItem &
  ({ kind: 'task'; block: ScheduledBlock } | { kind: 'event'; event: CalEvent })

/** What the action sheet is currently targeting (a task block). */
interface SheetTarget {
  block: ScheduledBlock
  task: Task
}

/**
 * What `AddEventModal` is currently open for, inside one {@link DayBlocksLayer}:
 * a fresh create (long-press empty space, prefilled with the snapped press
 * time) or an edit of an existing local Event (from `EventActionSheet`'s
 * "Edit event" row).
 */
type EventModalState =
  | { mode: 'create'; initialStart: number }
  | { mode: 'edit'; event: CalEvent }

/** Snap granularity for the long-press-to-create gesture — same 5-min grid as drag/resize (FR-28). */
const CREATE_SNAP_MIN = 5
/** How long a hold on empty grid space counts as "long press" before it creates an event — matches the block body's own long-press threshold. */
const CREATE_LONG_PRESS_MS = 220
/** Max finger drift (px) allowed during the hold before it's treated as a scroll/pan instead of a create — deliberately tight (unlike the block body's own long-press, which disables this check because ITS pan takes over after arming). */
const CREATE_MAX_DISTANCE_PX = 10

interface DayColumnProps {
  /** Local-midnight epoch ms of the day this column renders. */
  dayStartMs: number
  /** Vertical zoom (px/hour). */
  pxPerHour: number
  /** Blocks already filtered to this day (caller reads them via the store selector). */
  blocks: ScheduledBlock[]
  /** Fixed calendar events overlapping this day, already clipped to its boundary (caller reads them via `selectEventsByDay`). */
  events?: CalEvent[]
  /** taskId -> Task lookup for labels / "N steps" / slack color. */
  tasks: Record<string, Task>
  /** "now" for slack coloring + the current-time line; defaults to Date.now(). */
  now?: number
  /** Show the live current-time line (only for today). */
  showNow: boolean
  /** Tap a block -> open its task's detail sheet. */
  onBlockPress: (taskId: string) => void
  /** Vertical scroll target on first mount. */
  initialScrollHour?: number
  testID?: string
}

// ---------------------------------------------------------------------------
// Store-mutation helpers shared by drag / resize / the action sheet. Kept here
// (not inside a component) so both DayView and ThreeDayView run identical logic.
// ---------------------------------------------------------------------------

/**
 * Commit a drag: shift the block to `newStart` (duration preserved) and pin it,
 * exactly as PRD FR-28 / §9.5.10 specifies. Snapping is done by the caller.
 */
function commitBlockMove(blockId: string, newStart: number): void {
  useScheduleStore.getState().moveBlock(blockId, newStart)
}

/**
 * Commit a resize: the block now spans [newStart, newEnd). We update the task's
 * canonical `durationMin` and anchor its earliest start via `startAfter`, then
 * recompute so the single block for this task is re-placed at exactly the new
 * start with the new duration (the engine keeps `startAfter` as a lower bound,
 * PRD §9.5.3, and places each task once — so no duplicate is produced).
 *
 * We first clear any stale `pinned` flag on the OLD block: a pinned block is
 * carried through recompute verbatim AND the task is re-placed, which would
 * duplicate it. Unpinning lets stability drop the old block cleanly.
 *
 * Subtasked tasks derive their duration from the sum of subtask estimates
 * (doc 07 Part 3.2), so a duration change there is intentionally ignored by the
 * rollup; the caller only enables duration-affecting resizes when there are no
 * subtasks. A start move (top edge on such a task) still lands via `startAfter`.
 */
function commitBlockResize(
  block: ScheduledBlock,
  newStart: number,
  newEnd: number
): void {
  const schedule = useScheduleStore.getState()
  const tasks = useTaskStore.getState()
  const newDurationMin = Math.max(
    MIN_DURATION_MIN,
    Math.round((newEnd - newStart) / MS_PER_MIN)
  )
  if (block.pinned) schedule.setPinned(block.id, false)
  tasks.updateTask(block.taskId, { durationMin: newDurationMin, startAfter: newStart })
  schedule.recompute()
}

/**
 * One draggable + resizable block. Owns its OWN Reanimated shared values, so
 * dragging or resizing it never re-renders or shifts its neighbors (PRD FR-28
 * "other blocks stay put", NFR-1 60fps).
 *
 * Gestures (composed, all on the UI thread):
 *   • BODY long-press → pan: arms the drag, translates the block vertically,
 *     snaps to 5-min on release, commits via `moveBlock` (pins). A release that
 *     never moved past {@link DRAG_TAP_THRESHOLD_PX} is a TAP → opens the task.
 *   • TOP edge pan: moves the start (and thus duration); commits a resize.
 *   • BOTTOM edge pan: moves the end (duration only); commits a resize.
 *   • "…" affordance (tap) → opens the {@link BlockActionSheet}.
 *
 * Drag-vs-tap: a `didDragSV` shared value records whether the current body
 * gesture moved past {@link DRAG_TAP_THRESHOLD_PX}. The pan sets it (UI thread)
 * the instant the threshold is crossed; the open handler reads `.value` (JS
 * thread) on release and suppresses navigation when a drag happened, then
 * resets it. So a tap opens the task and a drag+release only moves it.
 */
function DraggableBlock({
  laid,
  dayStartMs,
  pxPerMin,
  totalHeight,
  task,
  event,
  contentWidth,
  now,
  onBlockPress,
  onRequestSheet,
  onRequestEventSheet,
  scrollController,
}: {
  laid: LaidOutItem<GridItem>
  dayStartMs: number
  pxPerMin: number
  totalHeight: number
  task?: Task
  event?: CalEvent
  contentWidth: number
  now?: number
  onBlockPress: (taskId: string) => void
  onRequestSheet: (target: SheetTarget) => void
  /** Tap a fixed Event block -> open {@link EventActionSheet} for it. Events are never draggable/resizable/tappable-to-open-task (FR-1 "never auto-moved") — this is their ONLY interaction. */
  onRequestEventSheet: (event: CalEvent) => void
  /** The hosting grid's scroll glue (fix #3 scroll-lock, fix #4 autoscroll). Optional — a grid with no scroll (none exist today) can omit it. */
  scrollController?: GridScrollController
}) {
  const reduceMotion = useReduceMotion()

  const item = laid.item
  const block = item.kind === 'task' ? item.block : undefined
  const isTask = block != null
  const blockId = block ? block.id : item.id
  const taskId = block ? block.taskId : ''
  // Base geometry from the (possibly not-yet-dragged) times.
  const { top, height } = blockGeometry(
    item.start,
    item.end,
    dayStartMs,
    pxPerMin,
    MIN_BLOCK_HEIGHT
  )

  // Duration edits are ignored by the rollup when subtasks exist (doc 07 Part
  // 3.2), so only offer a duration-changing resize on subtask-free tasks. A
  // start move (top edge) still works there (anchored via startAfter). Also
  // requires enough height to host two {@link EDGE_ZONE_PX} touch targets plus
  // a body in between (fix #8 widened the zones to 44px, so this guard now
  // actually matters — a very short block keeps the whole-block drag only).
  const canResize = isTask && (task?.subtasks.length ?? 0) === 0 && height >= MIN_RESIZABLE_PX

  // Fractional overlap placement -> absolute px within the content column.
  const left = laid.xFraction * contentWidth
  const width = laid.widthFraction * contentWidth

  // Live drag delta (whole-block move).
  const translateY = useSharedValue(0)
  // Live resize deltas: how far the top/bottom edge has been dragged (px).
  const resizeTop = useSharedValue(0)
  const resizeBottom = useSharedValue(0)
  // Logical armed flag for the body drag.
  const dragging = useSharedValue(0)
  // Whether the current body gesture has moved past the tap threshold. Read on
  // BOTH threads: the pan sets it (UI thread); the open handler reads `.value`
  // (JS thread) to decide whether a release should open the task or was a drag.
  const didDragSV = useSharedValue(0)
  // Eased 0->1 affordance driver (scale + shadow) for the body lift.
  const lift = useSharedValue(0)

  // --- Round B additions: live feedback + autoscroll state ---------------
  // Fix #4: total px the grid has been auto-scrolled DURING the current body
  // drag. The finger's raw translationY stays exactly under the touch (RNGH
  // measures it from raw touch deltas, unaffected by what scrolls underneath),
  // but the DAY-SPACE distance traveled also includes whatever the grid itself
  // scrolled — so the commit/pill math adds this in, while the visual
  // transform (which must stay glued to the finger) does not.
  const scrollAccum = useSharedValue(0)
  // Fix #4: UI-thread timestamp of the last autoscroll JS-thread hop, so the
  // `runOnJS(autoscrollTick)` call is throttled to `AUTOSCROLL.TICK_MS` even
  // though `onChange` itself fires at the native gesture event rate (~60Hz) —
  // without this, autoscroll would hop to JS on every frame while the finger
  // sits in an edge zone, which is unnecessary work against the 60fps budget.
  const lastAutoscrollTickMs = useSharedValue(0)
  // Fix #1: 0->1 visibility of the floating time-label pill, eased in/out.
  const pillOpacity = useSharedValue(0)
  // P2 fix: monotonic "which drag is this" counter, bumped on every body
  // long-press `onStart`. The deferred `commitMove` (fired from the
  // drop-spring's completion callback, see `pan.onEnd`) captures the
  // generation it belongs to and only commits if it's STILL the current one
  // when the spring settles — this is a one-shot guard (can't double-commit
  // within a drag) that ALSO can't misfire across drags (a slow/late spring
  // callback from a drag the user already released and re-grabbed can't
  // commit using its own stale `clamped`, since `dragGeneration` has moved on).
  const dragGeneration = useSharedValue(0)
  // Fix #2: the most recent SNAPPED slot (epoch ms) we already reacted to, one
  // per gesture kind (move / resize-top / resize-bottom each snap
  // independently), so `selectionAsync` + the pill text update only fire on a
  // slot CHANGE, not per pixel of movement.
  const lastMoveSlot = useSharedValue(item.start)
  const lastResizeTopSlot = useSharedValue(item.start)
  const lastResizeBottomSlot = useSharedValue(item.end)

  const fireSelectionHaptic = useCallback(() => {
    Haptics.selectionAsync().catch(() => {})
  }, [])

  // Fix #1: the pill's visible text lives in plain React state, updated via a
  // throttled `runOnJS` call fired only on a snap-slot change (below) — never
  // formatted inside a worklet, since `formatClockTime` isn't itself a
  // worklet (a plain imported function isn't auto-converted just by being
  // called from one). Because it only fires on the 5-min snap changing, this
  // is naturally throttled to a handful of JS-thread hops per drag, not per frame.
  const [pillLabel, setPillLabel] = useState('')
  const setPillRange = useCallback((startMs: number, endMs: number) => {
    setPillLabel(`${formatClockTime(startMs)} – ${formatClockTime(endMs)}`)
  }, [])

  // After a committed move/resize re-renders this block at its new geometry
  // (derived from item.start/item.end), zero the live offsets in the SAME commit
  // so they don't stack on top of the new geometry. This is what makes the drop
  // seamless (no flash), matching the shipped drag behavior.
  useEffect(() => {
    translateY.value = 0
    resizeTop.value = 0
    resizeBottom.value = 0
    lastMoveSlot.value = item.start
    lastResizeTopSlot.value = item.start
    lastResizeBottomSlot.value = item.end
  }, [
    item.start,
    item.end,
    translateY,
    resizeTop,
    resizeBottom,
    lastMoveSlot,
    lastResizeTopSlot,
    lastResizeBottomSlot,
  ])

  const commitMove = useCallback(
    (deltaPx: number) => {
      const deltaMs = (deltaPx / pxPerMin) * MS_PER_MIN
      const snapped = snapToGrid(item.start + deltaMs, dayStartMs, SNAP_MIN)
      commitBlockMove(blockId, snapped)
    },
    [pxPerMin, item.start, dayStartMs, blockId]
  )

  // Fix #4 edge-autoscroll: called (throttled, via runOnJS) on every body-pan
  // onChange while the finger sits inside an edge zone. Reads the grid's
  // measured viewport + the finger's window-space Y, and — if in a zone —
  // scrolls the grid and feeds the scrolled px back into `scrollAccum` (UI
  // thread) so the day-space delta used for the pill + commit stays correct
  // (the visual translateY itself needs no correction — see the comment on
  // `scrollAccum` above).
  //
  // P1 fix: `nextY` is clamped at BOTH ends against `maxScrollRef` (real
  // content end), not just floored at 0. A native ScrollView silently clamps
  // `scrollTo` past the real content end, so without this, dragging at the
  // bottom edge past content-end would keep accumulating "scrolled" px that
  // never actually moved on screen, corrupting the snapped commit time. Only
  // the delta that was ACTUALLY applied after clamping is accumulated.
  const autoscrollTick = useCallback(
    (absoluteY: number) => {
      const viewport = scrollController?.viewportRef.current
      const scrollRef = scrollController?.scrollRef.current
      if (!viewport || !scrollRef) return
      const distanceFromTop = absoluteY - viewport.top
      const distanceFromBottom = viewport.bottom - absoluteY
      const speed = autoscrollSpeed(distanceFromTop, distanceFromBottom)
      if (speed === 0) return
      const currentY = scrollController?.scrollYRef.current ?? 0
      const maxScroll = scrollController?.maxScrollRef.current ?? currentY
      const nextY = Math.min(maxScroll, Math.max(0, currentY + speed))
      const applied = nextY - currentY
      if (applied === 0) return
      scrollRef.scrollTo({ y: nextY, animated: false })
      if (scrollController) scrollController.scrollYRef.current = nextY
      scrollAccum.value += applied
    },
    [scrollController, scrollAccum]
  )

  const commitResizeTop = useCallback(
    (deltaPx: number) => {
      if (!block) return
      const deltaMs = (deltaPx / pxPerMin) * MS_PER_MIN
      // New start snapped; clamp so it can't cross the end (keep >= min duration).
      const rawStart = item.start + deltaMs
      const maxStart = item.end - MIN_DURATION_MIN * MS_PER_MIN
      const snapped = Math.min(snapToGrid(rawStart, dayStartMs, SNAP_MIN), maxStart)
      commitBlockResize(block, snapped, item.end)
    },
    [block, pxPerMin, item.start, item.end, dayStartMs]
  )

  const commitResizeBottom = useCallback(
    (deltaPx: number) => {
      if (!block) return
      const deltaMs = (deltaPx / pxPerMin) * MS_PER_MIN
      const rawEnd = item.end + deltaMs
      const minEnd = item.start + MIN_DURATION_MIN * MS_PER_MIN
      const snapped = Math.max(snapToGrid(rawEnd, dayStartMs, SNAP_MIN), minEnd)
      commitBlockResize(block, item.start, snapped)
    },
    [block, pxPerMin, item.start, item.end, dayStartMs]
  )

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  // Called on a tap / held-no-move release. Opens the task UNLESS the gesture
  // became a drag (didDragSV set on the UI thread). Reading `.value` on the JS
  // thread is safe for a plain shared value. Resets the flag for the next one.
  const openTaskFromGesture = useCallback(() => {
    if (didDragSV.value === 1) {
      didDragSV.value = 0
      return
    }
    if (isTask) onBlockPress(taskId)
  }, [didDragSV, isTask, onBlockPress, taskId])

  // --- EDGES: independent resize pans on thin top/bottom hit-zones. -------
  // Defined BEFORE the body gesture so the body can require them to fail first
  // (an edge drag wins over the whole-block drag when the touch starts on it).
  // Fix #2: each edge tracks its own snapped slot and fires a selection
  // haptic only when that slot changes (never per pixel).
  const topEdgeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canResize)
        .onStart(() => {
          'worklet'
          runOnJS(fireHaptic)()
        })
        .onChange((e) => {
          'worklet'
          resizeTop.value = e.translationY
          const rawStart = item.start + (e.translationY / pxPerMin) * MS_PER_MIN
          const maxStart = item.end - MIN_DURATION_MIN * MS_PER_MIN
          const snapped = Math.min(snapToGrid(rawStart, dayStartMs, SNAP_MIN), maxStart)
          if (snapped !== lastResizeTopSlot.value) {
            lastResizeTopSlot.value = snapped
            runOnJS(fireSelectionHaptic)()
          }
        })
        .onEnd((e) => {
          'worklet'
          resizeTop.value = e.translationY
          runOnJS(commitResizeTop)(e.translationY)
          runOnJS(fireHaptic)()
        }),
    [
      canResize,
      resizeTop,
      commitResizeTop,
      fireHaptic,
      fireSelectionHaptic,
      lastResizeTopSlot,
      item.start,
      item.end,
      pxPerMin,
      dayStartMs,
    ]
  )

  const bottomEdgeGesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(canResize)
        .onStart(() => {
          'worklet'
          runOnJS(fireHaptic)()
        })
        .onChange((e) => {
          'worklet'
          resizeBottom.value = e.translationY
          const rawEnd = item.end + (e.translationY / pxPerMin) * MS_PER_MIN
          const minEnd = item.start + MIN_DURATION_MIN * MS_PER_MIN
          const snapped = Math.max(snapToGrid(rawEnd, dayStartMs, SNAP_MIN), minEnd)
          if (snapped !== lastResizeBottomSlot.value) {
            lastResizeBottomSlot.value = snapped
            runOnJS(fireSelectionHaptic)()
          }
        })
        .onEnd((e) => {
          'worklet'
          resizeBottom.value = e.translationY
          runOnJS(commitResizeBottom)(e.translationY)
          runOnJS(fireHaptic)()
        }),
    [
      canResize,
      resizeBottom,
      commitResizeBottom,
      fireHaptic,
      fireSelectionHaptic,
      lastResizeBottomSlot,
      item.start,
      item.end,
      pxPerMin,
      dayStartMs,
    ]
  )

  const openSheet = useCallback(() => {
    if (block && task) onRequestSheet({ block, task })
  }, [block, task, onRequestSheet])

  // The "…" affordance is its own tap gesture so it reliably wins over the body
  // tap/long-press (which require it to fail first — see bodyGesture).
  const ellipsisGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(isTask)
        .maxDistance(12)
        .onEnd(() => {
          'worklet'
          runOnJS(openSheet)()
        }),
    [isTask, openSheet]
  )

  const openEventSheet = useCallback(() => {
    if (event) onRequestEventSheet(event)
  }, [event, onRequestEventSheet])

  // Fixed Events (FR-1 "never auto-moved") get exactly ONE interaction: a tap
  // opens EventActionSheet. `.enabled(!isTask)` makes this mutually exclusive
  // with every task-only gesture below (body drag, resize, ellipsis, tap-to-
  // open) — an event item always has `isTask === false`, so nothing in the
  // drag/resize path ever runs for one. `hitSlop` pads a short event's tap
  // target up toward the 44px minimum without changing its visual height,
  // matching how the resize edge-zones (EDGE_ZONE_PX) pad a thin visual grip.
  const eventVerticalPad = Math.max(0, (44 - height) / 2)
  const eventTapGesture = useMemo(
    () =>
      Gesture.Tap()
        .enabled(!isTask && !!event)
        .maxDistance(12)
        .hitSlop({ vertical: eventVerticalPad, horizontal: 4 })
        .onEnd(() => {
          'worklet'
          runOnJS(openEventSheet)()
        }),
    [isTask, event, eventVerticalPad, openEventSheet]
  )

  // Fix #3: bind/unbind the hosting ScrollView's own scroll while a body drag
  // is live, so the two pan responders never fight (belt-and-suspenders
  // alongside `requireExternalGestureToFail` below — see the file-level note
  // on scroll coordination). A no-op when no controller was passed down.
  const setGridScrollEnabled = useCallback(
    (enabled: boolean) => {
      scrollController?.setScrollEnabled(enabled)
    },
    [scrollController]
  )

  // --- BODY: long-press to arm, then pan to move; quick tap to open. ------
  // Three outcomes, disambiguated cleanly:
  //   • quick tap (finger up < 220ms, no move)  → Tap recognizer → open task.
  //   • long-press with NO move (held, released) → longPress.onEnd → open task.
  //   • long-press + drag past threshold         → pan commits the move; the
  //     open is suppressed because `didDragSV` was flagged mid-drag.
  // `Exclusive(group, tap)` guarantees only one of the two branches recognizes,
  // so the task never both moves and opens from a single gesture. The body also
  // requires the edge gestures to fail first, so an edge drag is never hijacked
  // by the whole-block move.
  const bodyGesture = useMemo(() => {
    const longPress = Gesture.LongPress()
      .minDuration(220)
      .maxDistance(10_000) // don't cancel on movement; the pan takes over
      .shouldCancelWhenOutside(false)
      .enabled(isTask)
      // An edge-resize wins over the whole-block drag when it starts on an edge.
      .requireExternalGestureToFail(topEdgeGesture, bottomEdgeGesture, ellipsisGesture)
      .onStart(() => {
        'worklet'
        dragging.value = 1
        didDragSV.value = 0
        dragGeneration.value = dragGeneration.value + 1
        scrollAccum.value = 0
        lastMoveSlot.value = item.start
        lastAutoscrollTickMs.value = 0
        lift.value = reduceMotion
          ? 1
          : withTiming(1, { duration: DURATIONS.fast, easing: EASINGS.standard })
        // Fix #1: fade the floating time pill in as soon as the drag arms.
        pillOpacity.value = reduceMotion ? 1 : withTiming(1, { duration: DURATIONS.fast, easing: EASINGS.standard })
        runOnJS(setPillRange)(item.start, item.end)
        runOnJS(fireHaptic)() // pick-up haptic
        // Fix #3: hand the grid's ScrollView over to the drag exclusively.
        runOnJS(setGridScrollEnabled)(false)
      })
      .onEnd(() => {
        'worklet'
        // Release after a hold. If the gesture never became a drag, this is a
        // (held) tap → open the task. A drag is handled by the pan's onEnd.
        if (didDragSV.value === 0) runOnJS(openTaskFromGesture)()
      })

    const pan = Gesture.Pan()
      .enabled(isTask)
      .manualActivation(false)
      .requireExternalGestureToFail(topEdgeGesture, bottomEdgeGesture, ellipsisGesture)
      .onChange((e) => {
        'worklet'
        if (dragging.value !== 1) return
        translateY.value = e.translationY
        // The instant we cross the threshold, flag this gesture as a real drag
        // (once) so the release does NOT also open the task.
        if (didDragSV.value === 0 && Math.abs(e.translationY) > DRAG_TAP_THRESHOLD_PX) {
          didDragSV.value = 1
        }
        // Fix #1 + #2: recompute the snapped target from the FULL day-space
        // delta (finger translation + whatever the grid has auto-scrolled so
        // far), update the pill, and fire a selection haptic exactly when the
        // snapped slot changes.
        const totalDeltaPx = e.translationY + scrollAccum.value
        const deltaMs = (totalDeltaPx / pxPerMin) * MS_PER_MIN
        const snappedStart = snapToGrid(item.start + deltaMs, dayStartMs, SNAP_MIN)
        if (snappedStart !== lastMoveSlot.value) {
          lastMoveSlot.value = snappedStart
          runOnJS(setPillRange)(snappedStart, snappedStart + (item.end - item.start))
          runOnJS(fireSelectionHaptic)()
        }
        // Fix #4: edge-autoscroll. Gated on a UI-thread timestamp so the
        // `runOnJS` hop only fires every {@link AUTOSCROLL.TICK_MS}, not on
        // every native onChange event (~60Hz) — keeps this well under the
        // 60fps budget even while the finger sits in an edge zone.
        if (scrollController) {
          const nowMs = Date.now()
          if (nowMs - lastAutoscrollTickMs.value >= AUTOSCROLL.TICK_MS) {
            lastAutoscrollTickMs.value = nowMs
            runOnJS(autoscrollTick)(e.absoluteY)
          }
        }
      })
      .onEnd((e) => {
        'worklet'
        if (dragging.value !== 1) return
        const moved = Math.abs(e.translationY) > DRAG_TAP_THRESHOLD_PX
        dragging.value = 0
        lift.value = reduceMotion
          ? 0
          : withTiming(0, { duration: DURATIONS.fast, easing: EASINGS.standard })
        // Fix #1: fade the pill back out on release.
        pillOpacity.value = reduceMotion ? 0 : withTiming(0, { duration: DURATIONS.fast, easing: EASINGS.standard })
        if (moved) {
          // Clamp so a block cannot be dragged off the top/bottom of the day
          // (day-space, i.e. including anything auto-scrolled in).
          const totalDeltaPx = e.translationY + scrollAccum.value
          const maxDown = totalHeight - (top + height)
          const clamped = Math.min(Math.max(totalDeltaPx, -top), maxDown)
          // P2 fix: the commit is DEFERRED to the spring's completion so the
          // settle actually plays — committing eagerly (alongside starting
          // the spring) let the store round-trip land before the spring
          // finished, and the geometry-reset `useEffect` zeroed `translateY`
          // out from under the in-flight animation, making the drop look
          // instant. Now the block visually settles first; only once it's
          // AT the target (spring finished) does the base position swap +
          // the `useEffect`'s reset happen together, so there's still no
          // jump — the block is already sitting exactly there.
          // `dragGeneration` guards this: capture the generation THIS drag
          // belongs to, and only commit if it's still current when the
          // spring settles. Covers both a same-drag double-fire AND a stale
          // callback from a drag the user already released and re-grabbed
          // before the old spring finished.
          const myGeneration = dragGeneration.value
          if (reduceMotion) {
            translateY.value = clamped
            runOnJS(commitMove)(clamped)
            runOnJS(fireHaptic)() // drop/commit haptic
          } else {
            translateY.value = withSpring(clamped, SPRINGS.tactile, (finished) => {
              'worklet'
              if (finished && dragGeneration.value === myGeneration) {
                runOnJS(commitMove)(clamped)
                runOnJS(fireHaptic)() // drop/commit haptic, on settle
              }
            })
          }
        } else {
          translateY.value = reduceMotion ? 0 : withSpring(0, SPRINGS.tactile)
        }
        // Fix #3: hand scrolling back to the ScrollView.
        runOnJS(setGridScrollEnabled)(true)
      })
      .onFinalize(() => {
        'worklet'
        if (dragging.value === 1) {
          translateY.value = 0
          dragging.value = 0
          lift.value = 0
          pillOpacity.value = 0
          runOnJS(setGridScrollEnabled)(true)
        }
        didDragSV.value = 0
      })

    // Quick tap (no long-press, no move) → open the task directly.
    const tap = Gesture.Tap()
      .enabled(isTask)
      .maxDistance(DRAG_TAP_THRESHOLD_PX)
      .requireExternalGestureToFail(topEdgeGesture, bottomEdgeGesture, ellipsisGesture)
      .onEnd(() => {
        'worklet'
        runOnJS(openTaskFromGesture)()
      })

    return Gesture.Exclusive(Gesture.Simultaneous(longPress, pan), tap, eventTapGesture)
  }, [
    isTask,
    dragging,
    didDragSV,
    translateY,
    lift,
    reduceMotion,
    fireHaptic,
    fireSelectionHaptic,
    commitMove,
    openTaskFromGesture,
    topEdgeGesture,
    bottomEdgeGesture,
    ellipsisGesture,
    eventTapGesture,
    totalHeight,
    top,
    height,
    scrollAccum,
    lastAutoscrollTickMs,
    pillOpacity,
    dragGeneration,
    lastMoveSlot,
    setPillRange,
    setGridScrollEnabled,
    scrollController,
    autoscrollTick,
    pxPerMin,
    dayStartMs,
    item.start,
    item.end,
  ])

  // Live geometry: body translate + top/bottom edge deltas reshape the wrapper.
  // Top edge moves BOTH top and height; bottom edge moves height only. A min
  // height guard keeps the block visible mid-drag.
  const animatedStyle = useAnimatedStyle(() => {
    const l = lift.value
    const rt = resizeTop.value
    const rb = resizeBottom.value
    const liveTop = top + rt
    const liveHeight = Math.max(MIN_BLOCK_HEIGHT, height - rt + rb)
    return {
      top: liveTop,
      height: liveHeight,
      transform: [{ translateY: translateY.value }, { scale: 1 + l * LIFT_SCALE }],
      zIndex: l > 0 || rt !== 0 || rb !== 0 ? 50 : 1,
      elevation: l * 8,
      // Fix #6: the Phase 1 tinted shadow color (warm ink, not pure black —
      // `shadows.*.shadowColor`, all `#292524`), scaled by the lift affordance.
      shadowColor: shadows.lg.shadowColor,
      shadowOpacity: l * 0.18,
      shadowRadius: l * 12,
      shadowOffset: { width: 0, height: l * 6 },
    }
  })

  // The "…" affordance sits top-right; shown for tasks on blocks with room.
  const showEllipsis = isTask && height >= MIN_RESIZABLE_PX

  // Fix #8: the resize grips are only visually present once the block is
  // lifted (mid-drag) or being actively resized — never at rest, so they add
  // no visual noise. The touch target itself ({@link EDGE_ZONE_PX}) stays the
  // same size regardless; only the grip's opacity (and hit-testing, so a
  // resting block's edge doesn't eat taps meant for a neighbor above/below
  // it) follows `lift`.
  const edgeZoneStyle = useAnimatedStyle(() => ({
    opacity: Math.max(lift.value, resizeTop.value !== 0 || resizeBottom.value !== 0 ? 1 : 0),
  }))

  // Fix #1: the floating time-label pill, positioned just above the block and
  // faded in/out with `pillOpacity`. It's a CHILD of the same Animated.View
  // that already carries `translateY` (via `animatedStyle`), so it rides the
  // block's drag position for free — it must NOT re-apply `translateY.value`
  // itself, or it would move at double the finger's speed. Only its own
  // fade + a small independent pop-in scale are added here.
  const pillStyle = useAnimatedStyle(() => ({
    opacity: pillOpacity.value,
    transform: [{ scale: 0.9 + pillOpacity.value * 0.1 }],
  }))

  return (
    <GestureDetector gesture={bodyGesture}>
      <Animated.View
        style={[{ position: 'absolute', left, width }, animatedStyle]}
      >
        {/* Fix #1: floating snapped-time pill, shown only while dragging (JS
            state `pillLabel` is empty otherwise; opacity is UI-thread driven
            so it never blocks the block's own touch handling). */}
        {pillLabel ? (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: 'absolute', top: -34, left: 0, right: 0, alignItems: 'center', zIndex: 60 },
              pillStyle,
            ]}
          >
            <View
              className="flex-row items-center rounded-full bg-neutral-900 px-3 py-1"
              style={shadows.sm}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Text style={tabularNums} className="text-caption font-semibold text-white">
                {pillLabel}
              </Text>
            </View>
          </Animated.View>
        ) : null}

        {/* The visual block fills the wrapper (which owns top/height/transform). */}
        <View style={{ flex: 1 }}>
          <CalendarBlock
            block={block}
            task={task}
            event={event}
            top={0}
            height={height}
            left="0%"
            width="100%"
            measuredWidth={width}
            now={now}
            fill
          />
        </View>

        {/* Resize edge-zones (task blocks with enough height only). Touch
            target is {@link EDGE_ZONE_PX} regardless of visibility (fix #8);
            the grip itself fades in only while lifted / actively resized. */}
        {canResize ? (
          <>
            <GestureDetector gesture={topEdgeGesture}>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    top: -EDGE_ZONE_PX / 2,
                    left: 0,
                    right: 0,
                    height: EDGE_ZONE_PX,
                  },
                  edgeZoneStyle,
                ]}
                accessibilityRole="adjustable"
                accessibilityLabel="Drag to change start time"
              >
                <ResizeHandle align="top" />
              </Animated.View>
            </GestureDetector>
            <GestureDetector gesture={bottomEdgeGesture}>
              <Animated.View
                style={[
                  {
                    position: 'absolute',
                    bottom: -EDGE_ZONE_PX / 2,
                    left: 0,
                    right: 0,
                    height: EDGE_ZONE_PX,
                  },
                  edgeZoneStyle,
                ]}
                accessibilityRole="adjustable"
                accessibilityLabel="Drag to change duration"
              >
                <ResizeHandle align="bottom" />
              </Animated.View>
            </GestureDetector>
          </>
        ) : null}

        {/* "…" affordance -> action sheet (own gesture so it wins the tap). */}
        {showEllipsis ? (
          <GestureDetector gesture={ellipsisGesture}>
            <View
              style={{ position: 'absolute', top: 2, right: 2 }}
              accessibilityRole="button"
              accessibilityLabel="Block actions"
              accessibilityHint="Postpone, lock, open, complete or delete"
            >
              <EllipsisButton />
            </View>
          </GestureDetector>
        ) : null}
      </Animated.View>
    </GestureDetector>
  )
}

/**
 * The gutter-less, scroll-less block LAYER for one day: it lays out the day's
 * tasks + events into overlap columns (§9.8), renders each as a
 * {@link DraggableBlock}, and hosts the shared {@link BlockActionSheet}. It
 * fills its parent (which owns the gutter offset and the vertical scroll).
 * Shared by {@link DayColumn} and {@link ThreeDayView}, so both views run
 * identical block + drag + resize + sheet internals.
 */
export function DayBlocksLayer({
  dayStartMs,
  pxPerHour,
  blocks,
  events = [],
  tasks,
  now,
  onBlockPress,
  scrollController,
}: {
  dayStartMs: number
  pxPerHour: number
  blocks: ScheduledBlock[]
  events?: CalEvent[]
  tasks: Record<string, Task>
  now?: number
  onBlockPress: (taskId: string) => void
  /** The hosting grid's scroll glue (fix #3 / #4), threaded down to every {@link DraggableBlock}. Optional. */
  scrollController?: GridScrollController
}) {
  const pxPerMin = pxPerMinFromHour(pxPerHour)
  const totalHeight = HOURS_IN_DAY * pxPerHour

  // Available width for the block layer. Measured so the fractional overlap
  // widths resolve to real px (§9.8).
  const [contentWidth, setContentWidth] = React.useState(0)

  // The block the action sheet targets (null = closed).
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null)
  // The Event the event action sheet targets (null = closed).
  const [eventSheetTarget, setEventSheetTarget] = useState<CalEvent | null>(null)
  // AddEventModal: closed, creating (long-press below), or editing an
  // existing local Event (from EventActionSheet's "Edit event" row). Owned
  // per-layer, exactly like `sheetTarget` above — ThreeDayView mounts one
  // DayBlocksLayer per column, each with its own independent sheet/modal
  // state, matching the established pattern rather than inventing a shared
  // one.
  const [eventModal, setEventModal] = useState<EventModalState | null>(null)

  // Build the interval-graph layout for this day's tasks + events (PRD §9.8).
  const laid = useMemo(() => {
    const items: GridItem[] = []
    for (const block of blocks) {
      items.push({
        id: block.id,
        start: block.start,
        end: block.end,
        kind: 'task',
        block,
      })
    }
    for (const event of events) {
      items.push({
        id: event.id,
        start: event.start,
        end: event.end,
        kind: 'event',
        event,
      })
    }
    return layoutDay(items, { eventsFirst: true })
  }, [blocks, events])

  // Long-press EMPTY grid space -> create an Event (FR-28), prefilled with
  // the pressed time snapped to the 5-min grid (matches how drag/resize
  // already snap). `e.y` is relative to this gesture's own view, which
  // shares the exact same coordinate frame as every block's `top` (both are
  // positioned against this same day column, y=0 == dayStartMs) — so it
  // feeds straight into `instantForY` with no extra translation.
  const openCreateAt = useCallback(
    (y: number) => {
      const raw = instantForY(y, dayStartMs, pxPerMin)
      const snapped = snapToGrid(raw, dayStartMs, CREATE_SNAP_MIN)
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
      setEventModal({ mode: 'create', initialStart: snapped })
    },
    [dayStartMs, pxPerMin]
  )

  // Tight `maxDistance` (unlike the block body's own long-press, which
  // disables its distance check because a Pan takes over once armed) so a
  // real scroll/pan gesture cancels this recognizer immediately rather than
  // racing it.
  const createGesture = useMemo(
    () =>
      Gesture.LongPress()
        .minDuration(CREATE_LONG_PRESS_MS)
        .maxDistance(CREATE_MAX_DISTANCE_PX)
        .onStart((e) => {
          'worklet'
          runOnJS(openCreateAt)(e.y)
        }),
    [openCreateAt]
  )

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
    >
      {/* Background: long-press empty space to create (FR-28). Painted
          BEHIND the block layer below (earlier sibling = lower z-order) —
          see the box-none note on that layer for why a long-press that lands
          ON a block never also reaches this one. */}
      <GestureDetector gesture={createGesture}>
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      </GestureDetector>

      {/* `pointerEvents="box-none"`: this wrapper is never itself a touch
          target, so a touch on genuinely empty space passes straight through
          to the create gesture behind it — but each block child (default
          `auto`) stays fully touchable, and since it's the topmost view at
          its own point, standard RN z-order hit-testing resolves a touch on
          a block to THAT block's own GestureDetector only. This is what lets
          long-press-to-create coexist with drag/resize/tap without either
          gesture racing the other. */}
      <View
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        pointerEvents="box-none"
      >
        {contentWidth > 0
          ? laid.map((l) => {
              const task =
                l.item.kind === 'task' ? tasks[l.item.block.taskId] : undefined
              const event = l.item.kind === 'event' ? l.item.event : undefined
              return (
                <DraggableBlock
                  key={l.item.id}
                  laid={l}
                  dayStartMs={dayStartMs}
                  pxPerMin={pxPerMin}
                  totalHeight={totalHeight}
                  task={task}
                  event={event}
                  contentWidth={contentWidth}
                  now={now}
                  onBlockPress={onBlockPress}
                  onRequestSheet={setSheetTarget}
                  onRequestEventSheet={setEventSheetTarget}
                  scrollController={scrollController}
                />
              )
            })
          : null}
      </View>

      <BlockActionSheet
        visible={sheetTarget != null}
        block={sheetTarget?.block ?? null}
        task={sheetTarget?.task ?? null}
        now={now}
        onClose={() => setSheetTarget(null)}
        onPostpone={(newStart) => {
          if (!sheetTarget) return
          const { block, task } = sheetTarget
          // Anchor the task's earliest start and move the block there now.
          useTaskStore.getState().updateTask(task.id, { startAfter: newStart })
          useScheduleStore.getState().moveBlock(block.id, newStart)
        }}
        onTogglePin={(pinned) => {
          if (sheetTarget) useScheduleStore.getState().setPinned(sheetTarget.block.id, pinned)
        }}
        onOpen={() => {
          if (sheetTarget) router.push(`/task/${sheetTarget.task.id}`)
        }}
        onComplete={() => {
          if (sheetTarget) useTaskStore.getState().completeTask(sheetTarget.task.id)
        }}
        onDelete={() => {
          if (sheetTarget) useTaskStore.getState().deleteTask(sheetTarget.task.id)
        }}
      />

      {/* Fixed-Event equivalent of BlockActionSheet above: local events get
          Edit/Delete, device-synced events are shown as clearly external
          (requirement 3 — see EventActionSheet's own header comment). */}
      <EventActionSheet
        visible={eventSheetTarget != null}
        event={eventSheetTarget}
        onClose={() => setEventSheetTarget(null)}
        onEdit={() => {
          if (eventSheetTarget) setEventModal({ mode: 'edit', event: eventSheetTarget })
        }}
        onDelete={() => {
          if (eventSheetTarget) useScheduleStore.getState().deleteLocalEvent(eventSheetTarget.id)
        }}
      />

      {/* Create (long-press above) or edit (EventActionSheet's Edit row).
          `onSave` branches on `eventModal.mode` to call the right store
          action — the modal itself stays store-agnostic. */}
      <AddEventModal
        visible={eventModal != null}
        event={eventModal?.mode === 'edit' ? eventModal.event : null}
        initialStart={eventModal?.mode === 'create' ? eventModal.initialStart : undefined}
        onClose={() => setEventModal(null)}
        onSave={({ title, start, end }) => {
          if (eventModal?.mode === 'edit') {
            useScheduleStore.getState().updateLocalEvent(eventModal.event.id, { title, start, end })
          } else {
            useScheduleStore.getState().addLocalEvent({ title, start, end })
          }
        }}
      />
    </View>
  )
}

/**
 * A single day's worth of blocks laid out over a {@link TimeGrid} (its own
 * gutter, hour lines, current-time line, and vertical scroll). Used by
 * {@link DayView}.
 */
export function DayColumn({
  dayStartMs,
  pxPerHour,
  blocks,
  events = [],
  tasks,
  now,
  showNow,
  onBlockPress,
  initialScrollHour,
  testID,
}: DayColumnProps) {
  // Captured once TimeGrid mounts its ScrollView (fix #3 scroll-lock, fix #4
  // autoscroll) and handed down into the block layer. Ref identity is stable,
  // so storing it in state is safe — it never triggers a stale-closure re-run.
  const [scrollController, setScrollController] = useState<GridScrollController>()

  return (
    <TimeGrid
      pxPerHour={pxPerHour}
      dayStartMs={dayStartMs}
      showNow={showNow}
      initialScrollHour={initialScrollHour}
      onScrollController={setScrollController}
      testID={testID}
    >
      <DayBlocksLayer
        dayStartMs={dayStartMs}
        pxPerHour={pxPerHour}
        blocks={blocks}
        events={events}
        tasks={tasks}
        now={now}
        onBlockPress={onBlockPress}
        scrollController={scrollController}
      />
    </TimeGrid>
  )
}

interface DayViewProps {
  /** The day to render. */
  date: Date
  /** Vertical zoom in px/hour (one of the FR-24 stops: 40/60/80/120). */
  pxPerHour: number
  /** Tap a block -> open the owning task's detail sheet. */
  onBlockPress: (taskId: string) => void
  /** "now" override for tests/determinism; defaults to Date.now(). */
  now?: number
  testID?: string
}

/**
 * Day view (PRD FR-23): a single full-width time-grid column for `date`, its
 * ScheduledBlocks (and any CalEvents) laid out with overlap columns (§9.8),
 * deadline-slack coloring, a live current-time line when the day is today,
 * 60fps long-press-drag to reschedule (FR-28), edge-drag to resize, and a
 * long-press/"…" action sheet (postpone / lock / open / complete / delete).
 *
 * Reads this day's blocks via the store selector (wrapped in `useShallow` to
 * avoid React #185 loops) and tasks via the task store.
 */
export function DayView({ date, pxPerHour, onBlockPress, now, testID }: DayViewProps) {
  const dayStartMs = startOfDay(date.getTime())
  const nowMs = now ?? Date.now()
  const showNow = isSameDay(dayStartMs, nowMs)

  const blocks = useScheduleStore(useShallow(selectBlocksByDay(dayStartMs)))
  const events = useScheduleStore(useShallow(selectEventsByDay(dayStartMs)))
  const tasks = useTaskStore((s) => s.tasks)

  return (
    <GestureHandlerRootView style={{ flex: 1 }} testID={testID}>
      <DayColumn
        dayStartMs={dayStartMs}
        pxPerHour={pxPerHour}
        blocks={blocks}
        events={events}
        tasks={tasks}
        now={nowMs}
        showNow={showNow}
        onBlockPress={onBlockPress}
      />
    </GestureHandlerRootView>
  )
}

// ---------------------------------------------------------------------------
// Small block-chrome pieces (resize grip + "…" button). Kept here so the
// calendar block internals live in one file.
// ---------------------------------------------------------------------------

/** A faint centered grip line drawn inside an edge-zone (top or bottom). */
function ResizeHandle({ align }: { align: 'top' | 'bottom' }) {
  return (
    <View
      pointerEvents="none"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: align === 'top' ? 'flex-start' : 'flex-end',
        paddingVertical: 3,
      }}
    >
      <View
        style={{
          width: 24,
          height: 3,
          borderRadius: 999,
          backgroundColor: 'rgba(63,63,70,0.28)',
        }}
      />
    </View>
  )
}

/**
 * The "…" affordance glyph (the tap is owned by `ellipsisGesture` on the parent
 * GestureDetector). Purely visual so it never competes with the body gesture.
 */
function EllipsisButton() {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 999,
        backgroundColor: 'rgba(255,255,255,0.72)',
      }}
    >
      <Ionicons name="ellipsis-horizontal" size={14} color="#57534E" />
    </View>
  )
}
