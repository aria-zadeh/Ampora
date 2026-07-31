/**
 * Compact all-day strip for Day and 3-Day (PRD §8.6/§8.7 have no time-grid
 * slot for a midnight-to-midnight event). `WeekView` solved this first with a
 * small strip above its grid — this reuses the exact same visual approach
 * (chips via `CalendarBlock`, a "+N" overflow, an "All day" gutter label,
 * present only when the rendered period actually has one) rather than
 * inventing a second one.
 *
 * Deliberately mounted OUTSIDE the scrolling/gesture time grid (`TimeGrid` /
 * `DayBlocksLayer`) — see `DayView.tsx#DayColumn` and `ThreeDayView.tsx` for
 * how this is a plain sibling ABOVE them, never a child, so it cannot
 * intercept the grid's long-press-create / drag / resize gestures. The pure
 * bucketing/height math lives in `allDayEvents.ts` (no react-native import,
 * so it stays unit-testable under `core/__tests__`); this file is rendering
 * only.
 */
import React, { useMemo, useState } from 'react'
import { View, Text, type LayoutChangeEvent } from 'react-native'
import type { CalEvent } from '@/types'
import { CalendarBlock } from './CalendarBlock'
import { GUTTER_WIDTH } from './hours'
import {
  ALLDAY_CHIP_H,
  ALLDAY_CHIP_GAP,
  ALLDAY_MAX_ROWS,
  bucketAllDayEvents,
  allDayStripHeight,
} from './allDayEvents'

/**
 * One row of `byDay.length` equal-width day columns, each stacking up to
 * {@link ALLDAY_MAX_ROWS} chips plus a "+N" overflow label. Column
 * POSITIONING is plain equal-flex (matches the grid's own day columns below
 * it); the row also self-measures its own width purely to feed
 * `CalendarBlock`'s §8.7 dense-mode width threshold, the same way
 * `DayBlocksLayer`/`WeekView` measure their own content width.
 */
function AllDayChipsRow({
  byDay,
  stripHeight,
  onEventPress,
  testIDPrefix,
}: {
  byDay: CalEvent[][]
  stripHeight: number
  onEventPress?: (event: CalEvent) => void
  testIDPrefix: string
}) {
  const [rowWidth, setRowWidth] = useState(0)
  const colWidth = byDay.length > 0 && rowWidth > 0 ? rowWidth / byDay.length : 0

  const onLayout = (e: LayoutChangeEvent) => setRowWidth(e.nativeEvent.layout.width)

  return (
    <View className="flex-row" style={{ height: stripHeight }} onLayout={onLayout}>
      {byDay.map((dayEvents, i) => {
        const shown = dayEvents.slice(0, ALLDAY_MAX_ROWS)
        const overflow = dayEvents.length - shown.length
        const rowsHeight = shown.length * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP)
        return (
          <View key={i} style={{ flex: 1 }} className="px-0.5 pt-0.5">
            <View style={{ height: rowsHeight, position: 'relative' }}>
              {shown.map((event, row) => (
                <CalendarBlock
                  key={event.id}
                  event={event}
                  top={row * (ALLDAY_CHIP_H + ALLDAY_CHIP_GAP)}
                  height={ALLDAY_CHIP_H}
                  left="0%"
                  width="100%"
                  measuredWidth={colWidth > 0 ? colWidth - 6 : undefined}
                  onPress={onEventPress ? () => onEventPress(event) : undefined}
                  testID={`${testIDPrefix}-${i}-${event.id}`}
                />
              ))}
            </View>
            {overflow > 0 ? (
              <Text
                className="text-tiny text-neutral-500"
                numberOfLines={1}
                accessibilityLabel={`${overflow} more all-day event${overflow === 1 ? '' : 's'}`}
              >
                +{overflow}
              </Text>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

export interface AllDayStripRowProps {
  /** Local-midnight epoch ms of each day column to render, left to right (1 for Day, 3 for 3-Day). */
  dayStarts: number[]
  /** CalEvents in scope (local + external; timed + all-day) — non-all-day ones are ignored internally, same as WeekView's own bucketing step. */
  events: CalEvent[]
  /** Tap a chip -> caller opens its detail sheet (mirrors the grid's own event tap). */
  onEventPress?: (event: CalEvent) => void
  testIDPrefix: string
}

/**
 * The full strip row: a fixed-width "All day" gutter label (aligned with the
 * time grid's own {@link GUTTER_WIDTH} rendered below it) plus the chips.
 * Renders nothing — not even the border — when nobody in `dayStarts` has an
 * all-day event, so a day/period with none is visually identical to before
 * this feature existed.
 */
export function AllDayStripRow({ dayStarts, events, onEventPress, testIDPrefix }: AllDayStripRowProps) {
  const byDay = useMemo(() => bucketAllDayEvents(events, dayStarts), [events, dayStarts])
  const stripHeight = allDayStripHeight(byDay)

  if (stripHeight === 0) return null

  return (
    <View className="flex-row border-b border-neutral-200 bg-neutral-100" testID={`${testIDPrefix}-row`}>
      <View style={{ width: GUTTER_WIDTH, height: stripHeight }} className="items-end justify-center pr-2">
        <Text className="text-tiny text-neutral-500" numberOfLines={1}>
          All day
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <AllDayChipsRow
          byDay={byDay}
          stripHeight={stripHeight}
          onEventPress={onEventPress}
          testIDPrefix={testIDPrefix}
        />
      </View>
    </View>
  )
}
