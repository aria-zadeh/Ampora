import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { currentTimeTop, pxPerMinFromHour } from '@/core/calendar'
import { startOfDay } from '@/core/scheduler/time'
import {
  useScheduleStore,
  selectBlocksByDay,
} from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { DayBlocksLayer } from './DayView'
import {
  GUTTER_WIDTH,
  HOURS_IN_DAY,
  DEFAULT_SCROLL_HOUR,
  hourLabel,
  hourLabelLong,
  hoursToRender,
  isSameDay,
} from './hours'

/** How many day columns the 3-Day view shows (PRD FR-23: default on phone). */
const DAYS = 3

interface ThreeDayViewProps {
  /** The anchor date; this and the next two days are shown. */
  date: Date
  /** Vertical zoom in px/hour (one of the FR-24 stops: 40/60/80/120). */
  pxPerHour: number
  /** Tap a block -> open the owning task's detail sheet. */
  onBlockPress: (taskId: string) => void
  /** "now" override for tests/determinism; defaults to Date.now(). */
  now?: number
  testID?: string
}

/** Weekday-abbrev + day-number header for one column (PRD FR-23 "horizontal day headers"). */
function DayHeader({
  dayStartMs,
  isToday,
}: {
  dayStartMs: number
  isToday: boolean
}) {
  const d = new Date(dayStartMs)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  const dayNum = d.getDate()
  return (
    <View className="flex-1 items-center py-2" accessibilityRole="header">
      <Text
        className={`text-tiny font-medium uppercase ${
          isToday ? 'text-primary-600' : 'text-neutral-400'
        }`}
      >
        {weekday}
      </Text>
      <View
        className={`mt-0.5 w-7 h-7 rounded-full items-center justify-center ${
          isToday ? 'bg-primary-600' : ''
        }`}
      >
        <Text
          className={`text-label font-semibold ${
            isToday ? 'text-white' : 'text-neutral-800'
          }`}
        >
          {dayNum}
        </Text>
      </View>
    </View>
  )
}

/** Red current-time line across the day columns (PRD FR-24), re-read each minute. */
function NowLine({
  dayStartMs,
  pxPerMin,
  totalHeight,
  columnIndex,
}: {
  dayStartMs: number
  pxPerMin: number
  totalHeight: number
  columnIndex: number
}) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    const timeout = setTimeout(() => {
      setNow(Date.now())
      interval = setInterval(() => setNow(Date.now()), 60_000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [])

  const top = currentTimeTop(now, dayStartMs, pxPerMin, totalHeight)
  if (top == null) return null

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: `${(columnIndex / DAYS) * 100}%`,
        width: `${(1 / DAYS) * 100}%`,
        top: top - 5,
        height: 10,
      }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-row items-center">
        <View className="w-2 h-2 rounded-full bg-danger-500" />
        <View className="flex-1 h-[2px] bg-danger-500 rounded-full" />
      </View>
    </View>
  )
}

/**
 * 3-Day view (PRD FR-23, the phone default): a shared left time gutter and
 * three day columns side by side, each rendering that day's ScheduledBlocks
 * (and any CalEvents) with overlap columns (§9.8), deadline-slack coloring, and
 * the same 60fps long-press-drag-to-reschedule (FR-28) as {@link DayView} —
 * drag within a column reschedules and pins the block via `moveBlock`.
 *
 * All three columns live in ONE vertical ScrollView so the days scroll
 * together, sharing a single gutter and one set of hour lines. Reuses
 * DayView's block internals via {@link DayBlocksLayer}.
 */
export function ThreeDayView({
  date,
  pxPerHour,
  onBlockPress,
  now,
  testID,
}: ThreeDayViewProps) {
  const scrollRef = useRef<ScrollView>(null)
  const pxPerMin = pxPerMinFromHour(pxPerHour)
  const totalHeight = HOURS_IN_DAY * pxPerHour
  const nowMs = now ?? Date.now()

  const anchor = startOfDay(date.getTime())
  const dayStarts = useMemo(
    () =>
      Array.from(
        { length: DAYS },
        (_, i) => startOfDay(anchor + i * 86_400_000)
      ),
    [anchor]
  )

  const hours = useMemo(() => hoursToRender(0, HOURS_IN_DAY - 1), [])

  // Scroll to the morning once, and again if the zoom changes.
  useEffect(() => {
    const y = Math.max(0, DEFAULT_SCROLL_HOUR * pxPerHour - pxPerHour / 2)
    const id = setTimeout(
      () => scrollRef.current?.scrollTo({ y, animated: false }),
      0
    )
    return () => clearTimeout(id)
  }, [pxPerHour])

  return (
    <View style={{ flex: 1 }} testID={testID}>
      {/* Sticky header row: an empty gutter spacer + the three day headers. */}
      <View className="flex-row border-b border-neutral-200 bg-neutral-100">
        <View style={{ width: GUTTER_WIDTH }} />
        <View className="flex-1 flex-row">
          {dayStarts.map((ds) => (
            <DayHeader
              key={ds}
              dayStartMs={ds}
              isToday={isSameDay(ds, nowMs)}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        className="flex-1"
        contentContainerStyle={{ height: totalHeight }}
      >
        <View style={{ height: totalHeight }}>
          {/* Hour lines + gutter labels, spanning the full width. */}
          {hours.map((hour) => {
            const top = hour * pxPerHour
            return (
              <View
                key={hour}
                pointerEvents="none"
                style={{ position: 'absolute', top, left: 0, right: 0 }}
              >
                <View className="flex-row">
                  <View
                    style={{ width: GUTTER_WIDTH }}
                    className="items-end pr-2"
                  >
                    <Text
                      className="text-tiny text-neutral-400"
                      style={{ marginTop: -6 }}
                      accessibilityLabel={hourLabelLong(hour)}
                      allowFontScaling
                    >
                      {hour === 0 ? '' : hourLabel(hour)}
                    </Text>
                  </View>
                  <View className="flex-1 h-[1px] bg-neutral-200" />
                </View>
              </View>
            )
          })}

          {/* Vertical separators between the day columns. */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: GUTTER_WIDTH,
              right: 0,
              top: 0,
              bottom: 0,
            }}
            className="flex-row"
          >
            {dayStarts.map((ds, i) => (
              <View
                key={ds}
                className={`flex-1 ${i > 0 ? 'border-l border-neutral-200' : ''}`}
              />
            ))}
          </View>

          {/* The three day block-layers, each in its own third, offset past the gutter. */}
          <View
            style={{
              position: 'absolute',
              left: GUTTER_WIDTH,
              right: 0,
              top: 0,
              bottom: 0,
            }}
            className="flex-row"
          >
            {dayStarts.map((ds) => (
              <DayColumnBlocks
                key={ds}
                dayStartMs={ds}
                pxPerHour={pxPerHour}
                now={nowMs}
                onBlockPress={onBlockPress}
              />
            ))}
          </View>

          {/* Current-time line only over the column that is today. */}
          {dayStarts.map((ds, i) =>
            isSameDay(ds, nowMs) ? (
              <NowLine
                key={`now-${ds}`}
                dayStartMs={ds}
                pxPerMin={pxPerMin}
                totalHeight={totalHeight}
                columnIndex={i}
              />
            ) : null
          )}
        </View>
      </ScrollView>
    </View>
  )
}

/**
 * One 3-Day column's data wiring: reads THIS day's blocks via the store
 * selector (wrapped in `useShallow` to avoid React #185 loops) and the task
 * map, then renders the shared {@link DayBlocksLayer}. Split into its own
 * component so each column subscribes to only its own day's slice.
 */
function DayColumnBlocks({
  dayStartMs,
  pxPerHour,
  now,
  onBlockPress,
}: {
  dayStartMs: number
  pxPerHour: number
  now?: number
  onBlockPress: (taskId: string) => void
}) {
  const blocks = useScheduleStore(useShallow(selectBlocksByDay(dayStartMs)))
  const tasks = useTaskStore((s) => s.tasks)

  return (
    <View className="flex-1">
      <DayBlocksLayer
        dayStartMs={dayStartMs}
        pxPerHour={pxPerHour}
        blocks={blocks}
        tasks={tasks}
        now={now}
        onBlockPress={onBlockPress}
      />
    </View>
  )
}
