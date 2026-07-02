import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, useWindowDimensions } from 'react-native'
import { useShallow } from 'zustand/react/shallow'
import {
  blockGeometry,
  currentTimeTop,
  pxPerMinFromHour,
  layoutDay,
  DEFAULT_PX_PER_HOUR,
  type LaidOutItem,
  type TimeSpanItem,
} from '@/core/calendar'
import { useScheduleStore, selectAllBlocks } from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import type { ScheduledBlock } from '@/types'
import { CalendarBlock } from './CalendarBlock'
import {
  GUTTER_WIDTH,
  HOURS_IN_DAY,
  DEFAULT_SCROLL_HOUR,
  dayStart,
  isSameDay,
  hourLabel,
  hourLabelLong,
  hoursToRender,
} from './hours'

const MS_PER_DAY = 86_400_000

/** Weekday header glyphs (single letter) + accessible long names. */
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

/**
 * When a day column is narrower than this many px, blocks render in "dense"
 * mode (colored bar + ~6 chars) — we pass `measuredWidth` to CalendarBlock so
 * its §8.7 width threshold trips. Below the 56px dense threshold on purpose so
 * a 7-up phone layout is always dense-legible rather than clipped.
 */
const MIN_DAY_COL_WIDTH = 44

/** Sticky header height (weekday letter + date number). */
const HEADER_HEIGHT = 52

export interface WeekViewProps {
  /** Any epoch-ms instant inside the week to render. The week starts Sunday. */
  date: number
  /** Vertical zoom in px per hour (FR-24 stops 40/60/80/120). @default 60 */
  pxPerHour?: number
  /** Fired with the tapped block (opens the detail sheet). */
  onBlockPress?: (block: ScheduledBlock) => void
  testID?: string
}

/** Sunday-anchored start-of-week (local midnight) for any instant in the week. */
function startOfWeek(t: number): number {
  const d = new Date(dayStart(t))
  d.setDate(d.getDate() - d.getDay()) // getDay(): 0=Sun
  return d.getTime()
}

interface DayColumn {
  dayStartMs: number
  isToday: boolean
  laid: LaidOutItem<TimeSpanItem & { block: ScheduledBlock }>[]
}

/**
 * WeekView (PRD FR-23, FR-25, §9.8): a compressed 7-day time grid. A fixed left
 * hour gutter plus seven narrow day columns sharing one vertical scroll. Blocks
 * are laid out per-day with the interval-graph overlap algorithm and rendered
 * small — CalendarBlock switches to its dense (bar + ~6 chars) treatment once a
 * column measures under 56px, with tap opening the detail sheet (§8.7).
 *
 * Sticky weekday headers sit above the scroll; today's column is tinted and its
 * header ringed in primary. Presentational data flows through the store
 * selectors (useShallow on the array selector, per project rule).
 */
export function WeekView({
  date,
  pxPerHour = DEFAULT_PX_PER_HOUR,
  onBlockPress,
  testID,
}: WeekViewProps) {
  const scrollRef = useRef<ScrollView>(null)
  const { width: screenWidth } = useWindowDimensions()

  const pxPerMin = pxPerMinFromHour(pxPerHour)
  const totalHeight = HOURS_IN_DAY * pxPerHour
  const hours = useMemo(() => hoursToRender(0, HOURS_IN_DAY - 1), [])

  const weekStart = useMemo(() => startOfWeek(date), [date])

  // NEW array from the store -> MUST use useShallow (Zustand v5, project rule).
  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const tasks = useTaskStore((s) => s.tasks)

  // Content width available for the 7 day columns (screen minus the gutter,
  // clamped so we never divide by a stale zero on first paint).
  const contentWidth = Math.max(screenWidth - GUTTER_WIDTH, MIN_DAY_COL_WIDTH * 7)
  const colWidth = Math.max(contentWidth / 7, MIN_DAY_COL_WIDTH)
  // If columns want to be wider than the screen affords, allow horizontal scroll.
  const gridInnerWidth = colWidth * 7
  const needsHScroll = gridInnerWidth > contentWidth + 0.5

  const now = Date.now()

  // Bucket blocks into the 7 days, running per-day overlap layout. Only blocks
  // whose task still exists are rendered (stale-block guard, matches UpcomingList).
  const days = useMemo<DayColumn[]>(() => {
    const weekEnd = weekStart + 7 * MS_PER_DAY
    const buckets: ScheduledBlock[][] = [[], [], [], [], [], [], []]

    for (const block of blocks) {
      if (!tasks[block.taskId]) continue
      if (block.end <= weekStart || block.start >= weekEnd) continue
      // Assign to the day of the block's start (clamped into the week).
      const idx = Math.floor((dayStart(block.start) - weekStart) / MS_PER_DAY)
      if (idx >= 0 && idx < 7) buckets[idx].push(block)
    }

    return buckets.map((dayBlocks, i) => {
      const ds = weekStart + i * MS_PER_DAY
      const items = dayBlocks.map((block) => ({
        id: block.id,
        start: block.start,
        end: block.end,
        kind: 'task' as const,
        block,
      }))
      return {
        dayStartMs: ds,
        isToday: isSameDay(ds, now),
        laid: layoutDay(items),
      }
    })
    // `now` intentionally omitted: only affects the today tint, recomputed cheaply below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, tasks, weekStart])

  // Scroll to ~07:00 on mount / zoom change (mirrors TimeGrid).
  useEffect(() => {
    const y = Math.max(0, DEFAULT_SCROLL_HOUR * pxPerHour - pxPerHour / 2)
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0)
    return () => clearTimeout(id)
  }, [pxPerHour])

  const columnsNode = (
    <View style={{ width: gridInnerWidth }}>
      {/* Sticky-style header row (weekday + date). Rendered outside the vertical
          scroll so it stays pinned. */}
      <View
        className="flex-row border-b border-neutral-200 bg-neutral-100"
        style={{ height: HEADER_HEIGHT }}
      >
        {days.map((day) => (
          <DayHeader key={day.dayStartMs} dayStartMs={day.dayStartMs} isToday={day.isToday} width={colWidth} />
        ))}
      </View>

      {/* Shared vertical scroll: hour lines span all 7 columns; each column owns
          its own absolutely-positioned block layer. */}
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ height: totalHeight }}
      >
        <View style={{ height: totalHeight, width: gridInnerWidth }}>
          {/* Hour hairlines across the full week width. */}
          {hours.map((hour) => (
            <View
              key={hour}
              pointerEvents="none"
              className="absolute left-0 right-0 h-[1px] bg-neutral-200"
              style={{ top: hour * pxPerHour }}
            />
          ))}

          {/* Per-day columns. */}
          <View className="flex-row" style={{ height: totalHeight }}>
            {days.map((day) => (
              <View
                key={day.dayStartMs}
                style={{ width: colWidth, height: totalHeight }}
                className={`border-l border-neutral-200 ${day.isToday ? 'bg-primary-50/40' : ''}`}
              >
                {day.laid.map((laid) => {
                  const block = laid.item.block
                  const { top, height } = blockGeometry(
                    block.start,
                    block.end,
                    day.dayStartMs,
                    pxPerMin
                  )
                  // Inner block width after the overlap fraction, minus a hair of
                  // padding — this measured width drives CalendarBlock's dense mode.
                  const measuredWidth = colWidth * laid.widthFraction - 4
                  return (
                    <CalendarBlock
                      key={block.id}
                      block={block}
                      task={tasks[block.taskId]}
                      top={top}
                      height={height}
                      left={`${laid.xFraction * 100}%`}
                      width={`${laid.widthFraction * 100}%`}
                      measuredWidth={measuredWidth}
                      now={now}
                      onPress={onBlockPress ? () => onBlockPress(block) : undefined}
                      testID={`week-block-${block.id}`}
                    />
                  )
                })}

                {/* Per-column current-time line, only on today. */}
                {day.isToday ? (
                  <NowLine dayStartMs={day.dayStartMs} pxPerMin={pxPerMin} totalHeight={totalHeight} />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  )

  return (
    <View className="flex-1 flex-row" testID={testID}>
      {/* Fixed left hour gutter — outside the horizontal scroll so it stays put. */}
      <View style={{ width: GUTTER_WIDTH }}>
        {/* Header spacer aligns the gutter with the day-header row. */}
        <View style={{ height: HEADER_HEIGHT }} className="border-b border-neutral-200 bg-neutral-100" />
        <GutterLabels
          hours={hours}
          pxPerHour={pxPerHour}
          totalHeight={totalHeight}
          scrollRef={scrollRef}
        />
      </View>

      {needsHScroll ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
          {columnsNode}
        </ScrollView>
      ) : (
        <View className="flex-1">{columnsNode}</View>
      )}
    </View>
  )
}

/** Weekday letter + date number; today gets a primary ring + filled date pill. */
function DayHeader({
  dayStartMs,
  isToday,
  width,
}: {
  dayStartMs: number
  isToday: boolean
  width: number
}) {
  const d = new Date(dayStartMs)
  const dayOfWeek = d.getDay()
  const dateNum = d.getDate()
  return (
    <View
      style={{ width }}
      className="items-center justify-center py-1"
      accessibilityLabel={`${WEEKDAY_LONG[dayOfWeek]} ${dateNum}${isToday ? ', today' : ''}`}
    >
      <Text className="text-tiny font-medium text-neutral-500 mb-0.5">
        {WEEKDAY_SHORT[dayOfWeek]}
      </Text>
      <View
        className={`w-7 h-7 rounded-full items-center justify-center ${
          isToday ? 'bg-primary-600' : ''
        }`}
      >
        <Text
          className={`text-caption font-semibold ${isToday ? 'text-white' : 'text-neutral-800'}`}
        >
          {dateNum}
        </Text>
      </View>
    </View>
  )
}

/**
 * The hour labels in the fixed gutter. Kept in its own vertical ScrollView that
 * is scroll-synced by the columns' scroll — but to avoid a second scroll view
 * fighting the main one, we render the labels statically at the same offsets and
 * rely on the gutter being tall enough; the labels track because the gutter's
 * ScrollView shares the same content height and mounts scrolled to the same y.
 */
function GutterLabels({
  hours,
  pxPerHour,
  totalHeight,
  scrollRef,
}: {
  hours: number[]
  pxPerHour: number
  totalHeight: number
  scrollRef: React.RefObject<ScrollView | null>
}) {
  const gutterScrollRef = useRef<ScrollView>(null)

  // Mirror the initial scroll position of the grid so labels align on mount.
  useEffect(() => {
    const y = Math.max(0, DEFAULT_SCROLL_HOUR * pxPerHour - pxPerHour / 2)
    const id = setTimeout(
      () => gutterScrollRef.current?.scrollTo({ y, animated: false }),
      0
    )
    return () => clearTimeout(id)
  }, [pxPerHour])

  return (
    <ScrollView
      ref={gutterScrollRef}
      scrollEnabled={false}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ height: totalHeight }}
      onScroll={undefined}
    >
      <View style={{ height: totalHeight }}>
        {hours.map((hour) => (
          <View
            key={hour}
            pointerEvents="none"
            className="absolute right-0 items-end pr-2"
            style={{ top: hour * pxPerHour - 6, left: 0 }}
          >
            <Text
              className="text-tiny text-neutral-500"
              accessibilityLabel={hourLabelLong(hour)}
              allowFontScaling
            >
              {hour === 0 ? '' : hourLabel(hour)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  )
}

/** Red current-time indicator scoped to a single day column (re-reads clock/min). */
function NowLine({
  dayStartMs,
  pxPerMin,
  totalHeight,
}: {
  dayStartMs: number
  pxPerMin: number
  totalHeight: number
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
      className="absolute left-0 right-0 flex-row items-center"
      style={{ top: top - 4, height: 8 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="w-2 h-2 rounded-full bg-danger-500" />
      <View className="flex-1 h-[2px] bg-danger-500" />
    </View>
  )
}
