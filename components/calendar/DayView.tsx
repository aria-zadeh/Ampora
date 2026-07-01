import React, { useCallback, useEffect, useMemo } from 'react'
import { View } from 'react-native'
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
import { isSameDay, HOURS_IN_DAY } from './hours'

/** Snap granularity for drag-to-reschedule (PRD FR-28: "snaps to a 5-min grid"). */
const SNAP_MIN = 5

/**
 * A time-grid item ready to lay out: either a scheduled task block or a fixed
 * calendar event. We tag `kind` so {@link layoutDay} biases events toward the
 * leftmost column (PRD §9.8), and keep the source so the renderer can pick the
 * right {@link CalendarBlock} props.
 */
type GridItem = TimeSpanItem &
  ({ kind: 'task'; block: ScheduledBlock } | { kind: 'event'; event: CalEvent })

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

/**
 * One draggable block. Owns its OWN Reanimated shared values, so dragging it
 * never re-renders or shifts its neighbors (PRD FR-28 "other blocks stay put",
 * NFR-1 60fps). Long-press arms the drag; the pan then translates the block
 * vertically; on release it snaps to the 5-min grid and commits via
 * `moveBlock` (which pins it). Light haptic on pick-up and on drop.
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
}) {
  const reduceMotion = useReduceMotion()
  const moveBlock = useScheduleStore((s) => s.moveBlock)

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

  // Fractional overlap placement -> absolute px within the content column.
  const left = laid.xFraction * contentWidth
  const width = laid.widthFraction * contentWidth

  // Drag state, per-block. `translateY` is the live finger delta; `dragging`
  // is the logical armed flag; `lift` is the eased 0->1 affordance driver
  // (scale + shadow) so the style reads plain values (no per-frame re-timing).
  // Events are not draggable.
  const translateY = useSharedValue(0)
  const dragging = useSharedValue(0)
  const lift = useSharedValue(0)

  // After a committed move re-renders this block at its new `top` (derived from
  // item.start), zero the drag offset in the SAME commit so it doesn't stack on
  // top of the new geometry. This is what makes the drop seamless (no flash).
  useEffect(() => {
    translateY.value = 0
  }, [item.start, item.end, translateY])

  const commitMove = useCallback(
    (deltaPx: number) => {
      const deltaMs = (deltaPx / pxPerMin) * MS_PER_MIN
      const snapped = snapToGrid(item.start + deltaMs, dayStartMs, SNAP_MIN)
      moveBlock(blockId, snapped)
    },
    [pxPerMin, item.start, dayStartMs, blockId, moveBlock]
  )

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
  }, [])

  // Long-press to arm, then pan to move. Composed so the pan only starts after
  // the long-press has activated (a plain scroll drag never grabs a block).
  const gesture = useMemo(() => {
    const longPress = Gesture.LongPress()
      .minDuration(220)
      .maxDistance(10_000) // don't cancel on movement; the pan takes over
      .shouldCancelWhenOutside(false)
      .enabled(isTask)
      .onStart(() => {
        'worklet'
        dragging.value = 1
        lift.value = reduceMotion
          ? 1
          : withTiming(1, { duration: DURATIONS.fast, easing: EASINGS.standard })
        runOnJS(fireHaptic)() // pick-up haptic
      })

    const pan = Gesture.Pan()
      .enabled(isTask)
      .manualActivation(false)
      .onChange((e) => {
        'worklet'
        if (dragging.value === 1) translateY.value = e.translationY
      })
      .onEnd((e) => {
        'worklet'
        if (dragging.value !== 1) return
        // Clamp so a block cannot be dragged off the top/bottom of the day.
        const maxDown = totalHeight - (top + height)
        const clamped = Math.min(Math.max(e.translationY, -top), maxDown)
        // Hold the visual at the dragged offset and commit the move. We do NOT
        // reset translateY here: the store re-renders the block at its new
        // `top`, and the effect below (keyed on the committed start) zeroes the
        // offset in the same commit, so the block never flashes back.
        translateY.value = clamped
        dragging.value = 0
        lift.value = reduceMotion
          ? 0
          : withTiming(0, { duration: DURATIONS.fast, easing: EASINGS.standard })
        runOnJS(commitMove)(clamped)
        runOnJS(fireHaptic)() // drop haptic
      })
      .onFinalize(() => {
        'worklet'
        if (dragging.value === 1) {
          translateY.value = 0
          dragging.value = 0
          lift.value = 0
        }
      })

    return Gesture.Simultaneous(longPress, pan)
  }, [
    isTask,
    dragging,
    translateY,
    lift,
    reduceMotion,
    fireHaptic,
    commitMove,
    totalHeight,
    top,
    height,
  ])

  const animatedStyle = useAnimatedStyle(() => {
    const l = lift.value
    return {
      transform: [
        { translateY: translateY.value },
        { scale: 1 + l * 0.02 },
      ],
      zIndex: l > 0 ? 50 : 1,
      elevation: l * 8,
      shadowColor: '#000',
      shadowOpacity: l * 0.18,
      shadowRadius: l * 12,
      shadowOffset: { width: 0, height: l * 6 },
    }
  })

  const handlePress = useCallback(() => {
    if (isTask) onBlockPress(taskId)
  }, [isTask, onBlockPress, taskId])

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={[
          { position: 'absolute', top, height, left, width },
          animatedStyle,
        ]}
      >
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
          onPress={handlePress}
        />
      </Animated.View>
    </GestureDetector>
  )
}

/**
 * The gutter-less, scroll-less block LAYER for one day: it lays out the day's
 * tasks + events into overlap columns (§9.8) and renders each as a
 * {@link DraggableBlock}. It fills its parent (which owns the gutter offset and
 * the vertical scroll). Shared by {@link DayColumn} (wrapped in a
 * {@link TimeGrid}) and by {@link ThreeDayView} (three of these under one
 * shared gutter + scroll), so both views run identical block + drag internals.
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
              />
            )
          })
        : null}
    </View>
  )
}

/**
 * A single day's worth of blocks laid out over a {@link TimeGrid} (its own
 * gutter, hour lines, current-time line, and vertical scroll). Used by
 * {@link DayView}. Presentational-with-gesture: it reads no store itself except
 * `moveBlock` inside each block; the parent supplies blocks + tasks.
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
 * deadline-slack coloring, a live current-time line when the day is today, and
 * 60fps long-press-drag to reschedule (FR-28).
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
