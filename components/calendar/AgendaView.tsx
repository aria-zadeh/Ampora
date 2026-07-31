import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import { useScheduleStore, selectAllBlocks, selectAllCalEvents } from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { slackColor } from '@/core/scheduler'
import type { SlackColor } from '@/core/scheduler'
import type { CalEvent, ScheduledBlock, Task } from '@/types'
import { PressableScale } from '@/components/ui/PressableScale'
import { EmptyState } from '@/components/ui/EmptyState'
import { colors, shadows } from '@/utils/design-tokens'
import { DURATIONS, staggerDelay } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { dayStart, formatBlockTimeRange } from './hours'

const MS_PER_DAY = 86_400_000

const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** Slack color token -> dot bg class + human label (a11y). Matches UpcomingList. */
const SLACK_STYLES: Record<SlackColor, { dot: string; label: string }> = {
  green: { dot: 'bg-success-500', label: 'On track' },
  amber: { dot: 'bg-warning-500', label: 'Getting close' },
  red: { dot: 'bg-danger-500', label: 'At risk' },
}

export interface AgendaViewProps {
  /**
   * Anchor date (epoch ms). Blocks that end on/after this day's local midnight
   * are shown, grouped ascending. Defaults to "today" behavior when the anchor
   * is the current day.
   */
  date: number
  /** Fired with the tapped block (opens the detail sheet). */
  onBlockPress?: (block: ScheduledBlock) => void
  /** Fired with the tapped CalEvent. */
  onEventPress?: (event: CalEvent) => void
  testID?: string
}

interface AgendaRow {
  block: ScheduledBlock
  task: Task
  slack: SlackColor
}

/** A flattened list item: a day header, a task-block row, or an event row (for one FlashList). */
type ListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; row: AgendaRow; index: number }
  | { type: 'event'; key: string; event: CalEvent; index: number }

/**
 * Day header relative to today: "Today" / "Tomorrow" / weekday, then month/day
 * once a week out. Mirrors UpcomingList's formatDayHeader.
 */
function formatDayHeader(dayStartMs: number, todayStart: number): string {
  const diffDays = Math.round((dayStartMs - todayStart) / MS_PER_DAY)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Tomorrow'
  const d = new Date(dayStartMs)
  if (diffDays > 1 && diffDays < 7) return WEEKDAY_LONG[d.getDay()]
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
}

/** Not-yet-done subtasks -> the "N steps" hint (PRD FR-27). */
function remainingSteps(task: Task): number {
  if (task.subtasks.length === 0) return 0
  return task.subtasks.filter((s) => s.completedAt == null).length
}

/** One not-yet-flattened entry: a task-block row or an event row, still carrying its day/sort keys. */
type AgendaEntry =
  | { dayKey: number; sortRank: 0 | 1; sortTime: number; node: { type: 'row'; key: string; row: AgendaRow } }
  | { dayKey: number; sortRank: 0 | 1; sortTime: number; node: { type: 'event'; key: string; event: CalEvent } }

/**
 * AgendaView (PRD FR-23): a premium grouped list of upcoming ScheduledBlocks
 * AND CalEvents, sectioned by day (Today / Tomorrow / weekday, dates
 * ascending). Task rows show the block's time range, title, a deadline-slack
 * dot, and an "N steps" hint. Event rows are visually distinct by shape (a
 * dashed border + calendar glyph, matching `CalendarBlock`'s event treatment
 * — reused, not reinvented) and show "All day" instead of a time range for
 * all-day events. Within a day, all-day events sort first, then everything
 * else by start time. Built on FlashList for performance with a stagger-enter
 * on the first screenful. Reuses the visual language of
 * components/schedule/UpcomingList.
 *
 * Data flows through the store selectors with useShallow (project rule); rows
 * for tasks that were deleted since the last recompute are skipped.
 */
export function AgendaView({ date, onBlockPress, onEventPress, testID }: AgendaViewProps) {
  const reduceMotion = useReduceMotion()

  // NEW arrays from the store -> MUST use useShallow (Zustand v5, project rule).
  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const calEvents = useScheduleStore(useShallow(selectAllCalEvents))
  const tasks = useTaskStore((s) => s.tasks)

  const items = useMemo<ListItem[]>(() => {
    const now = Date.now()
    const todayStart = dayStart(now)
    // Show everything ending on/after the later of "now" and the anchor day's
    // midnight, so navigating forward re-anchors the agenda.
    const floor = Math.min(dayStart(date), todayStart)

    const entries: AgendaEntry[] = []

    for (const block of blocks) {
      if (block.end < floor) continue
      const task = tasks[block.taskId]
      if (!task) continue // stale block; task deleted since last recompute
      entries.push({
        dayKey: dayStart(block.start),
        sortRank: 1,
        sortTime: block.start,
        node: { type: 'row', key: block.id, row: { block, task, slack: slackColor(task, now) } },
      })
    }

    for (const event of calEvents) {
      if (event.end < floor) continue
      // An event already under way when the visible range starts (e.g. a
      // multi-day all-day span that began before `floor`) is grouped under
      // the FIRST visible day instead of growing a stray past-day header —
      // presentational only, mirrors `scheduleStore#selectEventsByDay`'s
      // per-day render clamp; the canonical event is untouched.
      const groupStart = Math.max(event.start, floor)
      entries.push({
        dayKey: dayStart(groupStart),
        sortRank: event.allDay ? 0 : 1, // all-day events lead their day section
        sortTime: groupStart,
        node: { type: 'event', key: event.id, event },
      })
    }

    entries.sort((a, b) => a.dayKey - b.dayKey || a.sortRank - b.sortRank || a.sortTime - b.sortTime)

    // Flatten into headers + rows, one section per local day.
    const flat: ListItem[] = []
    let lastDay = -1
    let rowIndex = -1
    for (const entry of entries) {
      if (entry.dayKey !== lastDay) {
        lastDay = entry.dayKey
        flat.push({
          type: 'header',
          key: `h-${entry.dayKey}`,
          label: formatDayHeader(entry.dayKey, todayStart),
        })
      }
      rowIndex += 1
      if (entry.node.type === 'row') {
        flat.push({ type: 'row', key: entry.node.key, row: entry.node.row, index: rowIndex })
      } else {
        flat.push({ type: 'event', key: entry.node.key, event: entry.node.event, index: rowIndex })
      }
    }
    return flat
  }, [blocks, calEvents, tasks, date])

  if (items.length === 0) {
    return (
      <View className="flex-1" testID={testID}>
        <EmptyState
          icon="calendar-outline"
          title="Nothing scheduled"
          subtitle="Add a task with a duration and the engine will place it on your calendar."
        />
      </View>
    )
  }

  return (
    <View className="flex-1" testID={testID}>
      <FlashList
        data={items}
        keyExtractor={(item) => item.key}
        extraData={reduceMotion}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          if (item.type === 'header') {
            return (
              <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-500 mt-5 mb-3">
                {item.label}
              </Text>
            )
          }
          if (item.type === 'event') {
            return (
              <AgendaEventRow
                event={item.event}
                index={item.index}
                reduceMotion={reduceMotion}
                onPress={onEventPress}
              />
            )
          }
          return (
            <AgendaRowCard
              row={item.row}
              index={item.index}
              reduceMotion={reduceMotion}
              onPress={onBlockPress}
            />
          )
        }}
      />
    </View>
  )
}

function AgendaRowCard({
  row,
  index,
  reduceMotion,
  onPress,
}: {
  row: AgendaRow
  index: number
  reduceMotion: boolean
  onPress?: (block: ScheduledBlock) => void
}) {
  const { block, task, slack } = row
  const slackStyle = SLACK_STYLES[slack]
  const steps = remainingSteps(task)
  const done = block.status === 'done'

  const timeRange = useMemo(
    () => formatBlockTimeRange(block.start, block.end),
    [block.start, block.end]
  )

  const a11yLabel = [
    task.title,
    `scheduled ${timeRange}`,
    slackStyle.label,
    steps > 0 ? `${steps} ${steps === 1 ? 'step' : 'steps'}` : null,
    done ? 'done' : null,
  ]
    .filter(Boolean)
    .join(', ')

  // Stagger only the first screenful so scrolling deep doesn't re-animate.
  const entering =
    reduceMotion || index > 10
      ? undefined
      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)

  return (
    <Animated.View entering={entering} className="mb-3">
      <PressableScale
        onPress={onPress ? () => onPress(block) : undefined}
        haptic="light"
        style={shadows.sm}
        className="flex-row items-center gap-3 bg-white border border-neutral-200 rounded-lg p-4 min-h-14"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens details"
      >
        {/* Slack dot — the deadline-pressure signal (color never the sole cue). */}
        <View
          className={`w-2.5 h-2.5 rounded-full ${slackStyle.dot}`}
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        {/* Time (the value the scheduler adds) + task title. */}
        <View className="flex-1">
          <Text className="text-caption font-semibold text-primary-600">
            {timeRange}
          </Text>
          <Text
            className={`text-body font-medium mt-0.5 ${
              done ? 'text-neutral-500 line-through' : 'text-neutral-900'
            }`}
            numberOfLines={1}
          >
            {task.title}
          </Text>
        </View>

        {/* "N steps" hint (PRD FR-27). */}
        {steps > 0 ? (
          <Text className="text-caption text-neutral-500">
            {steps} {steps === 1 ? 'step' : 'steps'}
          </Text>
        ) : null}
      </PressableScale>
    </Animated.View>
  )
}

/**
 * A fixed CalEvent's row — same card shell as {@link AgendaRowCard} so the two
 * read as one list, but visually distinct by SHAPE (a dashed border + a
 * calendar glyph in place of the slack dot), never by hue alone, matching
 * `CalendarBlock`'s own event treatment (reused, not reinvented). All-day
 * events show "All day" instead of a formatted (and for a midnight-aligned
 * span, nonsensical) time range.
 */
function AgendaEventRow({
  event,
  index,
  reduceMotion,
  onPress,
}: {
  event: CalEvent
  index: number
  reduceMotion: boolean
  onPress?: (event: CalEvent) => void
}) {
  const timeRange = useMemo(
    () => (event.allDay ? 'All day' : formatBlockTimeRange(event.start, event.end)),
    [event.allDay, event.start, event.end]
  )
  const a11yLabel = `Event: ${event.title}, ${timeRange}`

  // Stagger only the first screenful so scrolling deep doesn't re-animate.
  const entering =
    reduceMotion || index > 10
      ? undefined
      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)

  return (
    <Animated.View entering={entering} className="mb-3">
      <PressableScale
        onPress={onPress ? () => onPress(event) : undefined}
        haptic="light"
        style={shadows.sm}
        className="flex-row items-center gap-3 bg-white border border-dashed border-neutral-300 rounded-lg p-4 min-h-14"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens details"
      >
        {/* Calendar glyph — the event's shape-based signal, standing in for
            the slack dot a task row carries. */}
        <Ionicons name="calendar-clear-outline" size={18} color={colors.light.textMuted} />

        <View className="flex-1">
          <Text className="text-caption font-semibold text-neutral-500">{timeRange}</Text>
          <Text className="text-body font-medium mt-0.5 text-neutral-900" numberOfLines={1}>
            {event.title}
          </Text>
        </View>
      </PressableScale>
    </Animated.View>
  )
}
