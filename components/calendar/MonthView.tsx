import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeIn } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import { useScheduleStore, selectAllBlocks, selectAllCalEvents } from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { slackColor } from '@/core/scheduler'
import type { SlackColor } from '@/core/scheduler'
import type { ScheduledBlock } from '@/types'
import { PressableScale } from '@/components/ui/PressableScale'
import { colors } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { dayStart, isSameDay } from './hours'

const MS_PER_DAY = 86_400_000

/** Column headers (Sunday-first, single letter) + accessible long names. */
const WEEKDAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const WEEKDAY_LONG = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]

/** Max slack dots/pills shown per day cell before collapsing to "+N". */
const MAX_DOTS = 3

/** Slack color token -> dot bg class + a11y label (matches CalendarBlock/UpcomingList). */
const SLACK_DOT: Record<SlackColor, { bg: string; label: string }> = {
  green: { bg: 'bg-success-500', label: 'on track' },
  amber: { bg: 'bg-warning-500', label: 'getting close' },
  red: { bg: 'bg-danger-500', label: 'at risk' },
}

export interface MonthViewProps {
  /** Any epoch-ms instant inside the month to render. */
  date: number
  /** Fired with the tapped day's local-midnight epoch ms (e.g. to jump to Day view). */
  onDayPress?: (dayMs: number) => void
  /** Fired with a tapped block (from a day cell's pills), if the caller wires cell taps to blocks. */
  onBlockPress?: (block: ScheduledBlock) => void
  testID?: string
}

interface DayCell {
  dayMs: number
  dayNum: number
  inMonth: boolean
  isToday: boolean
  slacks: SlackColor[]
  /** Count of CalEvents (local + external, timed or all-day) overlapping this day. */
  eventCount: number
}

/** Sunday-anchored start of the 6x7 grid that contains the given month. */
function gridStartFor(date: number): number {
  const first = new Date(dayStart(date))
  first.setDate(1)
  const d = new Date(first)
  d.setDate(1 - first.getDay()) // back up to the Sunday on/before the 1st
  return dayStart(d.getTime())
}

/**
 * MonthView (PRD FR-23): a custom premium 6x7 month grid. Each day cell shows
 * its date number and up to ~3 deadline-slack-colored dots for that day's
 * scheduled blocks, collapsing overflow to "+N". Today is highlighted with a
 * primary ring; days outside the current month are dimmed. Tapping a day fires
 * `onDayPress` with that day's local midnight (e.g. to switch to Day view).
 *
 * Custom grid (not react-native-calendars) so every token — the slack dots, the
 * today ring, the muted out-of-month treatment — matches the design system
 * exactly. Data flows through the store selector with useShallow (project rule).
 */
export function MonthView({
  date,
  onDayPress,
  onBlockPress: _onBlockPress,
  testID,
}: MonthViewProps) {
  const reduceMotion = useReduceMotion()

  // NEW arrays from the store -> MUST use useShallow (Zustand v5, project rule).
  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const calEvents = useScheduleStore(useShallow(selectAllCalEvents))
  const tasks = useTaskStore((s) => s.tasks)

  const monthIndex = useMemo(() => new Date(date).getMonth(), [date])

  const weeks = useMemo<DayCell[][]>(() => {
    const now = Date.now()
    const gridStart = gridStartFor(date)

    // Pre-bucket each rendered day's slack colors (deadline pressure per block).
    // 42 cells (6 weeks). We only keep the FIRST few + a count via slice below.
    const byDay = new Map<number, SlackColor[]>()
    const gridEnd = gridStart + 42 * MS_PER_DAY

    for (const block of blocks) {
      if (block.start >= gridEnd || block.end <= gridStart) continue
      const task = tasks[block.taskId]
      if (!task) continue // stale block whose task was deleted
      const cellDay = dayStart(block.start)
      if (cellDay < gridStart || cellDay >= gridEnd) continue
      const arr = byDay.get(cellDay) ?? []
      arr.push(slackColor(task, now))
      byDay.set(cellDay, arr)
    }

    // Events relevant to the visible grid, kept as a plain array (not
    // pre-bucketed by day): a multi-day all-day event overlaps several cells
    // at once, so each cell below runs its own overlap test rather than a
    // single-key lookup (mirrors the half-open interval test used throughout
    // `store/scheduleStore.ts`/`core/calendar`).
    const relevantEvents = calEvents.filter((e) => e.start < gridEnd && e.end > gridStart)

    const out: DayCell[][] = []
    for (let w = 0; w < 6; w++) {
      const row: DayCell[] = []
      for (let dow = 0; dow < 7; dow++) {
        const dayMs = gridStart + (w * 7 + dow) * MS_PER_DAY
        const dayEnd = dayMs + MS_PER_DAY
        const d = new Date(dayMs)
        let eventCount = 0
        for (const e of relevantEvents) {
          if (e.start < dayEnd && e.end > dayMs) eventCount++
        }
        row.push({
          dayMs,
          dayNum: d.getDate(),
          inMonth: d.getMonth() === monthIndex,
          isToday: isSameDay(dayMs, now),
          slacks: sortSlacks(byDay.get(dayMs) ?? []),
          eventCount,
        })
      }
      out.push(row)
    }
    return out
  }, [blocks, calEvents, tasks, date, monthIndex])

  const entering = reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)

  return (
    <View className="flex-1 px-2" testID={testID}>
      {/* Weekday column headers. */}
      <View className="flex-row py-2">
        {WEEKDAY_SHORT.map((label, i) => (
          <View key={i} className="flex-1 items-center">
            <Text className="text-tiny font-semibold uppercase tracking-wide text-neutral-500">
              {label}
            </Text>
          </View>
        ))}
      </View>

      {/* 6 week rows. */}
      <Animated.View entering={entering} className="flex-1">
        {weeks.map((week, wi) => (
          <View key={wi} className="flex-row flex-1">
            {week.map((cell) => (
              <DayCellView
                key={cell.dayMs}
                cell={cell}
                onPress={onDayPress ? () => onDayPress(cell.dayMs) : undefined}
              />
            ))}
          </View>
        ))}
      </Animated.View>
    </View>
  )
}

/** Order dots red -> amber -> green so the most urgent signal always survives the "+N" cut. */
function sortSlacks(slacks: SlackColor[]): SlackColor[] {
  const rank: Record<SlackColor, number> = { red: 0, amber: 1, green: 2 }
  return [...slacks].sort((a, b) => rank[a] - rank[b])
}

function DayCellView({ cell, onPress }: { cell: DayCell; onPress?: () => void }) {
  const { dayNum, inMonth, isToday, slacks, eventCount } = cell
  const shown = slacks.slice(0, MAX_DOTS)
  const overflow = slacks.length - shown.length

  const d = new Date(cell.dayMs)
  const a11yParts = [
    `${WEEKDAY_LONG[d.getDay()]} ${dayNum}`,
    isToday ? 'today' : null,
    slacks.length > 0
      ? `${slacks.length} scheduled ${slacks.length === 1 ? 'block' : 'blocks'}`
      : 'no scheduled blocks',
    eventCount > 0 ? `${eventCount} ${eventCount === 1 ? 'event' : 'events'}` : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <PressableScale
      onPress={onPress}
      haptic="selection"
      style={{ flex: 1 }}
      className="m-0.5"
      accessibilityRole="button"
      accessibilityLabel={a11yParts}
      accessibilityHint="Opens this day"
    >
      <View
        className={`flex-1 rounded-lg p-1 border ${
          isToday
            ? 'border-primary-600 bg-primary-50/50'
            : 'border-transparent'
        }`}
      >
        {/* Date number. */}
        <View className="items-center">
          <View
            className={`w-6 h-6 rounded-full items-center justify-center ${
              isToday ? 'bg-primary-600' : ''
            }`}
          >
            <Text
              className={`text-caption ${
                isToday
                  ? 'text-white font-semibold'
                  : inMonth
                    ? 'text-neutral-800 font-medium'
                    : 'text-neutral-300'
              }`}
            >
              {dayNum}
            </Text>
          </View>
        </View>

        {/* Slack dots row + overflow count. */}
        {slacks.length > 0 ? (
          <View className="flex-row flex-wrap items-center justify-center mt-1 gap-0.5">
            {shown.map((slack, i) => (
              <View
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${SLACK_DOT[slack].bg} ${
                  inMonth ? '' : 'opacity-40'
                }`}
              />
            ))}
            {overflow > 0 ? (
              <Text
                className={`text-tiny font-medium ml-0.5 ${
                  inMonth ? 'text-neutral-500' : 'text-neutral-300'
                }`}
              >
                +{overflow}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Event indicator — a calendar glyph, never a colored dot, so it
            reads as "an event" by SHAPE and stays distinct from the round
            slack dots above (doc 02 "status is never color alone"). One
            glyph regardless of count; a trailing number appears past one,
            mirroring the slack row's own "+N" overflow treatment. */}
        {eventCount > 0 ? (
          <View className="flex-row items-center justify-center mt-0.5 gap-0.5">
            <Ionicons
              name="calendar-clear-outline"
              size={9}
              color={inMonth ? colors.light.textMuted : colors.light.textDisabled}
            />
            {eventCount > 1 ? (
              <Text
                className={`text-tiny font-medium ${inMonth ? 'text-neutral-500' : 'text-neutral-300'}`}
              >
                {eventCount}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </PressableScale>
  )
}
