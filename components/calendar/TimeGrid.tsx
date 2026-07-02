import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView } from 'react-native'
import {
  currentTimeTop,
  pxPerMinFromHour,
  MS_PER_HOUR,
} from '@/core/calendar'
import {
  GUTTER_WIDTH,
  HOURS_IN_DAY,
  DEFAULT_SCROLL_HOUR,
  hourLabel,
  hourLabelLong,
  hoursToRender,
} from './hours'
import { useGridScrollController, type GridScrollController } from './gridScroll'

interface TimeGridProps {
  /** Vertical zoom in px per hour (one of the FR-24 stops: 40/60/80/120). */
  pxPerHour: number
  /** Epoch ms mapped to y=0 — local midnight of the rendered day. */
  dayStartMs: number
  /**
   * Absolutely-positioned block layer(s). The caller positions children via
   * `top`/`height`/`left`/`width` (see {@link CalendarBlock}); this grid owns
   * the gutter, hour lines, current-time line, and vertical scroll only.
   */
  children?: React.ReactNode
  /** Show the live red current-time line (only meaningful for "today"). @default true */
  showNow?: boolean
  /**
   * Full grid height in px. Defaults to `HOURS_IN_DAY * pxPerHour`. Passing an
   * explicit height lets a caller reserve extra bottom padding.
   */
  height?: number
  /** Hour to scroll to on first mount. @default 7 (07:00). */
  initialScrollHour?: number
  /** First / last hour index to render lines + labels for. @default 0..23 */
  fromHour?: number
  toHour?: number
  /**
   * Reports the {@link GridScrollController} for this grid's ScrollView once
   * available, so a caller (e.g. `DayColumn`) can pass it down into a
   * draggable block layer for scroll-lock during drag (fix #3) and
   * edge-autoscroll (fix #4). Optional — a grid with no draggable children
   * (e.g. read-only previews) can omit it.
   */
  onScrollController?: (controller: GridScrollController) => void
  testID?: string
}

/** Red current-time indicator (PRD FR-24), re-reading the clock each minute. */
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
    // Align the first tick to the next minute boundary, then tick every minute.
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
      style={{ position: 'absolute', left: GUTTER_WIDTH - 5, right: 0, top: top - 5, height: 10 }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View className="flex-row items-center">
        {/* Dot at the gutter edge, then a hairline across the day. */}
        <View className="w-2.5 h-2.5 rounded-full bg-danger-500" />
        <View className="flex-1 h-[2px] bg-danger-500 rounded-full" />
      </View>
    </View>
  )
}

/**
 * The calendar time grid (PRD FR-24): a fixed 44px left gutter of hour labels,
 * hairline hour lines across the content area, an absolutely-positioned block
 * layer (the caller's `children`), and a live red current-time line. Scrolls
 * vertically, landing on ~07:00 by default.
 *
 * Presentational only — no data access, no gestures. The view agents layer
 * gesture handling (drag/resize/create) and the block data on top.
 */
export function TimeGrid({
  pxPerHour,
  dayStartMs,
  children,
  showNow = true,
  height,
  initialScrollHour = DEFAULT_SCROLL_HOUR,
  fromHour = 0,
  toHour = HOURS_IN_DAY - 1,
  onScrollController,
  testID,
}: TimeGridProps) {
  const pxPerMin = pxPerMinFromHour(pxPerHour)
  const totalHeight = height ?? HOURS_IN_DAY * pxPerHour
  const hours = useMemo(() => hoursToRender(fromHour, toHour), [fromHour, toHour])

  const { controller, scrollEnabled, onScroll, onViewportLayout, onContentSizeChange } =
    useGridScrollController()
  const scrollRef = controller.scrollRef
  // A plain View wrapping the ScrollView, measured in window space to feed
  // edge-autoscroll (fix #4). Kept separate from `scrollRef` (whose target is
  // the ScrollView, not cleanly typed for `measureInWindow`) — a plain `View`
  // ref is fully typed for it and shares the exact same box as the ScrollView
  // it wraps 1:1.
  const viewportWrapRef = useRef<View>(null)

  // Hand the controller to the caller once (identity is stable across
  // renders — the ref objects never change), so it can be threaded down to a
  // draggable block layer without this component knowing about drag at all.
  useEffect(() => {
    onScrollController?.(controller)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Scroll to the initial hour once, after layout.
  useEffect(() => {
    const y = Math.max(0, initialScrollHour * pxPerHour - pxPerHour / 2)
    const id = setTimeout(() => scrollRef.current?.scrollTo({ y, animated: false }), 0)
    return () => clearTimeout(id)
    // Re-run if the zoom changes so the morning stays roughly in view.
  }, [initialScrollHour, pxPerHour, scrollRef])

  // Re-measure the viewport's window-space bounds on every layout pass
  // (rotation, split view, initial mount).
  const measureViewport = () => {
    viewportWrapRef.current?.measureInWindow((_x, y, _w, h) => {
      onViewportLayout({ top: y, bottom: y + h })
    })
  }

  return (
    <View ref={viewportWrapRef} style={{ flex: 1 }} onLayout={measureViewport} testID={testID}>
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
          {/* Hour lines + gutter labels. */}
          {hours.map((hour) => {
            const top = hour * pxPerHour
            return (
              <View
                key={hour}
                pointerEvents="none"
                style={{ position: 'absolute', top, left: 0, right: 0 }}
              >
                <View className="flex-row">
                  <View style={{ width: GUTTER_WIDTH }} className="items-end pr-2">
                    {/* Nudge the label up so it centers on the line, not below it. */}
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

          {/* Block layer — caller-positioned, offset past the gutter. */}
          <View
            style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER_WIDTH, right: 0 }}
          >
            {children}
          </View>

          {showNow ? (
            <NowLine dayStartMs={dayStartMs} pxPerMin={pxPerMin} totalHeight={totalHeight} />
          ) : null}
        </View>
      </ScrollView>
    </View>
  )
}

/** Re-exported so callers computing block `left`/`width` can subtract the gutter. */
export { GUTTER_WIDTH, MS_PER_HOUR }
