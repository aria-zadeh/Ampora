import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
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
  runOnJS,
} from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { useShallow } from 'zustand/react/shallow'

import type { ScheduledBlock, CalEvent, Task } from '@/types'
import {
  blockGeometry,
  pxPerMinFromHour,
  snapToGrid,
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
} from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { EASINGS, DURATIONS } from '@/utils/motion'
import { TimeGrid } from './TimeGrid'
import { CalendarBlock } from './CalendarBlock'
import { BlockActionSheet } from './BlockActionSheet'
import { isSameDay, HOURS_IN_DAY } from './hours'

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
 * Height (px) of each top/bottom edge resize hit-zone. Kept small so it only
 * grabs deliberate edge drags; the body long-press still moves the whole block.
 * Only shown when the block is tall enough to host two edge zones + a body.
 */
const EDGE_ZONE_PX = 14
/** A block must be at least this tall (px) to expose resize edge-zones. */
const MIN_RESIZABLE_PX = 44

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

interface DayColumnProps {
  /** Local-midnight epoch ms of the day this column renders. */
  dayStartMs: number
  /** Vertical zoom (px/hour). */
  pxPerHour: number
  /** Blocks already filtered to this day (caller reads them via the store selector). */
  blocks: ScheduledBlock[]
  /** Fixed calendar events overlapping this day (optional; none exist yet). */
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
}) {
  const reduceMotion = useReduceMotion()

  const item = laid.item
  const block = item.kind === 'task' ? item.block : undefined
  const isTask = block != null
  const blockId = block ? block.id : item.id
  const taskId = block ? block.taskId : ''
  // Duration edits are ignored by the rollup when subtasks exist (doc 07 Part
  // 3.2), so only offer a duration-changing resize on subtask-free tasks. A
  // start move (top edge) still works there (anchored via startAfter).
  const canResize = isTask && (task?.subtasks.length ?? 0) === 0

  // Base geometry from the (possibly not-yet-dragged) times.
  const { top, height } = blockGeometry(
    item.start,
    item.end,
    dayStartMs,
    pxPerMin,
    MIN_BLOCK_HEIGHT
  )

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

  // After a committed move/resize re-renders this block at its new geometry
  // (derived from item.start/item.end), zero the live offsets in the SAME commit
  // so they don't stack on top of the new geometry. This is what makes the drop
  // seamless (no flash), matching the shipped drag behavior.
  useEffect(() => {
    translateY.value = 0
    resizeTop.value = 0
    resizeBottom.value = 0
  }, [item.start, item.end, translateY, resizeTop, resizeBottom])

  const commitMove = useCallback(
    (deltaPx: number) => {
      const deltaMs = (deltaPx / pxPerMin) * MS_PER_MIN
      const snapped = snapToGrid(item.start + deltaMs, dayStartMs, SNAP_MIN)
      commitBlockMove(blockId, snapped)
    },
    [pxPerMin, item.start, dayStartMs, blockId]
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
        })
        .onEnd((e) => {
          'worklet'
          resizeTop.value = e.translationY
          runOnJS(commitResizeTop)(e.translationY)
          runOnJS(fireHaptic)()
        }),
    [canResize, resizeTop, commitResizeTop, fireHaptic]
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
        })
        .onEnd((e) => {
          'worklet'
          resizeBottom.value = e.translationY
          runOnJS(commitResizeBottom)(e.translationY)
          runOnJS(fireHaptic)()
        }),
    [canResize, resizeBottom, commitResizeBottom, fireHaptic]
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
        lift.value = reduceMotion
          ? 1
          : withTiming(1, { duration: DURATIONS.fast, easing: EASINGS.standard })
        runOnJS(fireHaptic)() // pick-up haptic
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
      })
      .onEnd((e) => {
        'worklet'
        if (dragging.value !== 1) return
        const moved = Math.abs(e.translationY) > DRAG_TAP_THRESHOLD_PX
        dragging.value = 0
        lift.value = reduceMotion
          ? 0
          : withTiming(0, { duration: DURATIONS.fast, easing: EASINGS.standard })
        if (moved) {
          // Clamp so a block cannot be dragged off the top/bottom of the day.
          const maxDown = totalHeight - (top + height)
          const clamped = Math.min(Math.max(e.translationY, -top), maxDown)
          // Hold the visual at the dragged offset and commit; the effect keyed on
          // the committed start zeroes the offset in the same commit (no flash).
          translateY.value = clamped
          runOnJS(commitMove)(clamped)
          runOnJS(fireHaptic)() // drop haptic
        } else {
          translateY.value = 0
        }
      })
      .onFinalize(() => {
        'worklet'
        if (dragging.value === 1) {
          translateY.value = 0
          dragging.value = 0
          lift.value = 0
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

    return Gesture.Exclusive(Gesture.Simultaneous(longPress, pan), tap)
  }, [
    isTask,
    dragging,
    didDragSV,
    translateY,
    lift,
    reduceMotion,
    fireHaptic,
    commitMove,
    openTaskFromGesture,
    topEdgeGesture,
    bottomEdgeGesture,
    ellipsisGesture,
    totalHeight,
    top,
    height,
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
      transform: [{ translateY: translateY.value }, { scale: 1 + l * 0.02 }],
      zIndex: l > 0 || rt !== 0 || rb !== 0 ? 50 : 1,
      elevation: l * 8,
      shadowColor: '#000',
      shadowOpacity: l * 0.18,
      shadowRadius: l * 12,
      shadowOffset: { width: 0, height: l * 6 },
    }
  })

  // The "…" affordance sits top-right; shown for tasks on blocks with room.
  const showEllipsis = isTask && height >= MIN_RESIZABLE_PX

  return (
    <GestureDetector gesture={bodyGesture}>
      <Animated.View
        style={[{ position: 'absolute', left, width }, animatedStyle]}
      >
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

        {/* Resize edge-zones (task blocks with enough height only). */}
        {canResize ? (
          <>
            <GestureDetector gesture={topEdgeGesture}>
              <Animated.View
                style={{
                  position: 'absolute',
                  top: -EDGE_ZONE_PX / 2,
                  left: 0,
                  right: 0,
                  height: EDGE_ZONE_PX,
                }}
                accessibilityRole="adjustable"
                accessibilityLabel="Drag to change start time"
              >
                <ResizeHandle align="top" />
              </Animated.View>
            </GestureDetector>
            <GestureDetector gesture={bottomEdgeGesture}>
              <Animated.View
                style={{
                  position: 'absolute',
                  bottom: -EDGE_ZONE_PX / 2,
                  left: 0,
                  right: 0,
                  height: EDGE_ZONE_PX,
                }}
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
}: {
  dayStartMs: number
  pxPerHour: number
  blocks: ScheduledBlock[]
  events?: CalEvent[]
  tasks: Record<string, Task>
  now?: number
  onBlockPress: (taskId: string) => void
}) {
  const pxPerMin = pxPerMinFromHour(pxPerHour)
  const totalHeight = HOURS_IN_DAY * pxPerHour

  // Available width for the block layer. Measured so the fractional overlap
  // widths resolve to real px (§9.8).
  const [contentWidth, setContentWidth] = React.useState(0)

  // The block the action sheet targets (null = closed).
  const [sheetTarget, setSheetTarget] = useState<SheetTarget | null>(null)

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

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => setContentWidth(e.nativeEvent.layout.width)}
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
              />
            )
          })
        : null}

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
        onLock={() => {
          if (sheetTarget) useScheduleStore.getState().setPinned(sheetTarget.block.id, true)
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
  return (
    <TimeGrid
      pxPerHour={pxPerHour}
      dayStartMs={dayStartMs}
      showNow={showNow}
      initialScrollHour={initialScrollHour}
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
  const tasks = useTaskStore((s) => s.tasks)

  return (
    <GestureHandlerRootView style={{ flex: 1 }} testID={testID}>
      <DayColumn
        dayStartMs={dayStartMs}
        pxPerHour={pxPerHour}
        blocks={blocks}
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
      <Ionicons name="ellipsis-horizontal" size={14} color="#52525B" />
    </View>
  )
}
