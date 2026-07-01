import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import { useScheduleStore, selectAllBlocks } from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { slackColor } from '@/core/scheduler'
import type { SlackColor } from '@/core/scheduler'
import type { ScheduledBlock, Task } from '@/types'
import { PressableScale } from '@/components/ui/PressableScale'
import { EmptyState } from '@/components/ui/EmptyState'
import { shadows } from '@/utils/design-tokens'
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
  testID?: string
}

interface AgendaRow {
  block: ScheduledBlock
  task: Task
  slack: SlackColor
}

/** A flattened list item: either a day header or a block row (for one FlashList). */
type ListItem =
  | { type: 'header'; key: string; label: string }
  | { type: 'row'; key: string; row: AgendaRow; index: number }

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

/**
 * AgendaView (PRD FR-23): a premium grouped list of upcoming ScheduledBlocks,
 * sectioned by day (Today / Tomorrow / weekday, dates ascending). Each row shows
 * the block's time range, the task title, a deadline-slack dot, and an "N steps"
 * hint. Built on FlashList for performance with a stagger-enter on the first
 * screenful. Reuses the visual language of components/schedule/UpcomingList.
 *
 * Data flows through the store selector with useShallow (project rule); rows for
 * tasks that were deleted since the last recompute are skipped.
 */
export function AgendaView({ date, onBlockPress, testID }: AgendaViewProps) {
  const reduceMotion = useReduceMotion()

  // NEW array from the store -> MUST use useShallow (Zustand v5, project rule).
  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const tasks = useTaskStore((s) => s.tasks)

  const items = useMemo<ListItem[]>(() => {
    const now = Date.now()
    const todayStart = dayStart(now)
    // Show everything ending on/after the later of "now" and the anchor day's
    // midnight, so navigating forward re-anchors the agenda.
    const floor = Math.min(dayStart(date), todayStart)

    const rows: AgendaRow[] = []
    for (const block of blocks) {
      if (block.end < floor) continue
      const task = tasks[block.taskId]
      if (!task) continue // stale block; task deleted since last recompute
      rows.push({ block, task, slack: slackColor(task, now) })
    }
    rows.sort((a, b) => a.block.start - b.block.start)

    // Flatten into headers + rows, one section per local day.
    const flat: ListItem[] = []
    let lastDay = -1
    let rowIndex = -1
    for (const row of rows) {
      const ds = dayStart(row.block.start)
      if (ds !== lastDay) {
        lastDay = ds
        flat.push({
          type: 'header',
          key: `h-${ds}`,
          label: formatDayHeader(ds, todayStart),
        })
      }
      rowIndex += 1
      flat.push({ type: 'row', key: row.block.id, row, index: rowIndex })
    }
    return flat
  }, [blocks, tasks, date])

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
        renderItem={({ item }) =>
          item.type === 'header' ? (
            <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-400 mt-5 mb-3">
              {item.label}
            </Text>
          ) : (
            <AgendaRowCard
              row={item.row}
              index={item.index}
              reduceMotion={reduceMotion}
              onPress={onBlockPress}
            />
          )
        }
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
              done ? 'text-neutral-400 line-through' : 'text-neutral-900'
            }`}
            numberOfLines={1}
          >
            {task.title}
          </Text>
        </View>

        {/* "N steps" hint (PRD FR-27). */}
        {steps > 0 ? (
          <Text className="text-caption text-neutral-400">
            {steps} {steps === 1 ? 'step' : 'steps'}
          </Text>
        ) : null}
      </PressableScale>
    </Animated.View>
  )
}
