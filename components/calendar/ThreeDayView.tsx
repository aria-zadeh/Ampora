import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import { useShallow } from 'zustand/react/shallow'

import { currentTimeTop, pxPerMinFromHour } from '@/core/calendar'
import { startOfDay } from '@/core/scheduler/time'
import {
  useScheduleStore,
  selectBlocksByDay,
  selectEventsByDay,
  selectAllCalEvents,
} from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { DayBlocksLayer } from './DayView'
import { AllDayStripRow } from './AllDayStrip'
import { EventActionSheet } from './EventActionSheet'
import { AddEventModal } from '@/components/ui/AddEventModal'
import type { CalEvent } from '@/types'
import { useGridScrollController, type GridScrollController } from './gridScroll'
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

/**
 * Round B fix #5 gate: cross-day drag (dragging a block from one day column
 * into an adjacent one) is DELIBERATELY NOT implemented yet. Each day column
 * here is its own `DayColumnBlocks` -> `DayBlocksLayer`, clipped to that
 * column's own box (RN Views clip their children by default, and there is no
 * "escape into a sibling's paint area" primitive) — so a block dragged past
 * its own column's edge would be invisibly clipped mid-drag, the opposite of
 * this round's "show feedback while dragging" goal. Doing this properly needs
 * ONE shared absolute canvas spanning all 3 days (not 3 independent per-day
 * layers) so a lifted block can visually cross a column boundary, which is a
 * real layout change to this view, not a wiring change — left for a follow-up
 * round rather than shipped half-working. Vertical (in-column) drag, resize,
 * the time pill, snap haptics, spring-drop, and edge-autoscroll all work
 * fully here today via the same {@link DayBlocksLayer} DayView uses.
 *
 * Exported (unused elsewhere today) so a future cross-day implementation has
 * an obvious single switch, matching the `FEATURE_FLAGS.IGNITION_NATIVE`
 * gating pattern already used for the native app-locking module.
 */
export const ENABLE_CROSS_DAY_DRAG = false

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
          isToday ? 'text-primary-600' : 'text-neutral-500'
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
 * the same interactions as {@link DayView}: 60fps long-press-drag-to-reschedule
 * (FR-28, taps still open the task — a drag never does), top/bottom edge-drag to
 * resize (5-min snap), and a "…" action sheet (postpone / lock / open / complete
 * / delete). All of this comes free from the shared {@link DayBlocksLayer}.
 *
 * All three columns live in ONE vertical ScrollView so the days scroll
 * together, sharing a single gutter and one set of hour lines.
 */
export function ThreeDayView({
  date,
  pxPerHour,
  onBlockPress,
  now,
  testID,
}: ThreeDayViewProps) {
  const {
    controller: scrollController,
    scrollEnabled,
    onScroll,
    onViewportLayout,
    onContentSizeChange,
  } = useGridScrollController()
  const scrollRef = scrollController.scrollRef
  // Same viewport-measurement pattern as TimeGrid (fix #4 edge-autoscroll needs
  // window-space bounds; a plain View ref is cleanly typed for `measureInWindow`,
  // the ScrollView instance itself is not — see TimeGrid.tsx for the full note).
  const viewportWrapRef = React.useRef<View>(null)
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

  // All-day events render in a compact strip ABOVE the shared grid rather
  // than as a 24-hour block inside it (DayBlocksLayer's own `laid` memo,
  // shared by every DayColumnBlocks below, already skips `allDay` events for
  // exactly that reason). Needs its own top-level subscription (unlike each
  // DayColumnBlocks' per-day `selectEventsByDay`) because a multi-day
  // all-day event must be bucketed across all 3 visible days at once —
  // mirrors WeekView's own top-level `selectAllCalEvents` + bucketing.
  const calEvents = useScheduleStore(useShallow(selectAllCalEvents))

  // This sheet pair is scoped to the strip ONLY — separate from each
  // DayBlocksLayer instance's own internal sheetTarget / eventSheetTarget /
  // eventModal state (one per day column), which is untouched, so nothing
  // here can regress the grid's existing gesture/sheet wiring.
  const [stripEventTarget, setStripEventTarget] = useState<CalEvent | null>(null)
  const [stripEditTarget, setStripEditTarget] = useState<CalEvent | null>(null)
  const stripTestIDPrefix = testID ? `${testID}-allday` : '3day-allday'

  // Scroll to the morning once, and again if the zoom changes.
  useEffect(() => {
    const y = Math.max(0, DEFAULT_SCROLL_HOUR * pxPerHour - pxPerHour / 2)
    const id = setTimeout(
      () => scrollRef.current?.scrollTo({ y, animated: false }),
      0
    )
    return () => clearTimeout(id)
  }, [pxPerHour, scrollRef])

  const measureViewport = () => {
    viewportWrapRef.current?.measureInWindow((_x, y, _w, h) => {
      onViewportLayout({ top: y, bottom: y + h })
    })
  }

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

      {/* All-day strip: a plain sibling ABOVE the scrolling grid, not a child
          of it, so it can never intercept the grid's long-press-create /
          drag / resize gestures. Present only when one of the 3 visible days
          actually has an all-day event — otherwise renders nothing. */}
      <AllDayStripRow
        dayStarts={dayStarts}
        events={calEvents}
        onEventPress={setStripEventTarget}
        testIDPrefix={stripTestIDPrefix}
      />

      <View ref={viewportWrapRef} style={{ flex: 1 }} onLayout={measureViewport}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          scrollEnabled={scrollEnabled}
          onScroll={(e) => onScroll(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
          onContentSizeChange={(_w, h) => onContentSizeChange(h)}
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
                        className="text-tiny text-neutral-500"
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
                  scrollController={scrollController}
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

      <EventActionSheet
        visible={stripEventTarget != null}
        event={stripEventTarget}
        onClose={() => setStripEventTarget(null)}
        onEdit={() => {
          if (stripEventTarget) setStripEditTarget(stripEventTarget)
        }}
        onDelete={() => {
          if (stripEventTarget) useScheduleStore.getState().deleteLocalEvent(stripEventTarget.id)
        }}
      />
      <AddEventModal
        visible={stripEditTarget != null}
        event={stripEditTarget}
        onClose={() => setStripEditTarget(null)}
        onSave={({ title, start, end, allDay }) => {
          if (stripEditTarget) {
            useScheduleStore.getState().updateLocalEvent(stripEditTarget.id, { title, start, end, allDay })
          }
        }}
      />
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
  scrollController,
}: {
  dayStartMs: number
  pxPerHour: number
  now?: number
  onBlockPress: (taskId: string) => void
  /** The shared 3-day ScrollView's scroll glue (fix #3 / #4), same controller passed to all 3 columns. */
  scrollController?: GridScrollController
}) {
  const blocks = useScheduleStore(useShallow(selectBlocksByDay(dayStartMs)))
  const events = useScheduleStore(useShallow(selectEventsByDay(dayStartMs)))
  const tasks = useTaskStore((s) => s.tasks)

  return (
    <View className="flex-1">
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
    </View>
  )
}
