/**
 * Shared drag-time scroll glue for the calendar grids (Round B fix #3 / #4).
 *
 * `DayView`'s `TimeGrid` and `ThreeDayView` each own their own vertical
 * `ScrollView` (the latter inlines its grid rather than reusing `TimeGrid`),
 * but a dragging {@link DraggableBlock} needs the same two things from either
 * one: a way to scroll it programmatically, and a way to lock it out while a
 * drag is in progress so the pan gesture never fights the ScrollView's own
 * pan responder. This tiny controller shape lets `DraggableBlock` stay
 * agnostic of which grid it's inside.
 *
 * RN-specific (touches `ScrollView`), so it lives in `components/calendar/`
 * rather than the portable `core/calendar/` math.
 */
import { useRef, useState, useCallback, type RefObject } from 'react'
import type { ScrollView } from 'react-native'

/** Window-space vertical bounds of a grid's visible scroll viewport. */
export interface ViewportBounds {
  top: number
  bottom: number
}

/** What a dragging block needs from its hosting grid's scroll view. */
export interface GridScrollController {
  /** Imperative ref to the grid's vertical ScrollView. */
  scrollRef: RefObject<ScrollView | null>
  /** Bind/unbind the ScrollView's own scroll gesture while a drag is live. */
  setScrollEnabled: (enabled: boolean) => void
  /** Current scroll offset in px (kept in sync via the ScrollView's onScroll). */
  scrollYRef: RefObject<number>
  /**
   * Window-space top/bottom of the visible viewport (kept in sync via the
   * ScrollView wrapper's `onLayout`), used to detect finger proximity to the
   * grid's edges for autoscroll (fix #4). Null until the first layout.
   */
  viewportRef: RefObject<ViewportBounds | null>
  /**
   * Max scroll offset in px (`contentHeight - viewportHeight`, floored at 0).
   * Kept in sync via the ScrollView's `onContentSizeChange` + the viewport's
   * `onLayout`. Autoscroll MUST clamp against this — a native ScrollView
   * silently clamps `scrollTo` at the real content end, so scrolling "past"
   * it without this check would inflate `scrollAccum` by px that never
   * actually moved on screen, corrupting the day-space delta used for the
   * drop commit (the P1 correctness bug this fixes).
   */
  maxScrollRef: RefObject<number>
}

/**
 * Owns the pieces above so a grid component can wire them into its
 * `ScrollView` (`ref`, `scrollEnabled`, `onScroll`, `onContentSizeChange`) and
 * pass the resulting controller down to its block layer. `scrollEnabled` is
 * plain React state (it only flips twice per drag — arm and release — so
 * it's cheap), while the live offset / content height / viewport are refs
 * updated without a re-render.
 */
export function useGridScrollController(): {
  controller: GridScrollController
  scrollEnabled: boolean
  onScroll: (y: number) => void
  /** Wire to the ScrollView wrapper's `onLayout` to keep `viewportRef` current. */
  onViewportLayout: (bounds: ViewportBounds) => void
  /** Wire to the ScrollView's `onContentSizeChange` to keep `maxScrollRef` current. */
  onContentSizeChange: (contentHeight: number) => void
} {
  const scrollRef = useRef<ScrollView>(null)
  const scrollYRef = useRef(0)
  const viewportRef = useRef<ViewportBounds | null>(null)
  // Sentinel so autoscroll is PERMISSIVE (never wrongly blocked) until both
  // the content height and the viewport have reported at least once — an
  // under-populated `0` here would otherwise clamp downward autoscroll to
  // zero before either measurement has arrived.
  const maxScrollRef = useRef(Number.POSITIVE_INFINITY)
  const contentHeightRef = useRef<number | null>(null)
  const [scrollEnabled, setScrollEnabled] = useState(true)

  /** Recompute `maxScrollRef` once BOTH content height and viewport are known. */
  const recomputeMaxScroll = () => {
    if (contentHeightRef.current == null || viewportRef.current == null) return
    const viewportHeight = viewportRef.current.bottom - viewportRef.current.top
    maxScrollRef.current = Math.max(0, contentHeightRef.current - viewportHeight)
  }

  const onScroll = useCallback((y: number) => {
    scrollYRef.current = y
  }, [])

  const onViewportLayout = useCallback((bounds: ViewportBounds) => {
    viewportRef.current = bounds
    recomputeMaxScroll()
  }, [])

  const onContentSizeChange = useCallback((contentHeight: number) => {
    contentHeightRef.current = contentHeight
    recomputeMaxScroll()
  }, [])

  return {
    controller: { scrollRef, setScrollEnabled, scrollYRef, viewportRef, maxScrollRef },
    scrollEnabled,
    onScroll,
    onViewportLayout,
    onContentSizeChange,
  }
}

/** Edge-autoscroll tuning (Round B fix #4). Kept together so it's tunable in one place. */
export const AUTOSCROLL = {
  /** Distance (px) from the viewport's top/bottom edge that arms autoscroll. */
  EDGE_ZONE_PX: 60,
  /** Max scroll speed (px per tick) at the very edge (0 distance). */
  MAX_SPEED_PX: 14,
  /** Interval (ms) between autoscroll ticks — throttled well under 60fps budget. */
  TICK_MS: 50,
} as const

/**
 * Pure speed function for edge-autoscroll: given the finger's distance (px)
 * from the top and bottom edges of the grid's visible viewport, returns a
 * signed px-per-tick scroll delta (negative = scroll up/toward earlier times,
 * positive = scroll down/toward later times), or 0 outside both edge zones.
 * Speed ramps linearly from 0 (at the edge of the zone) to
 * {@link AUTOSCROLL.MAX_SPEED_PX} (right at the viewport edge).
 *
 * Kept as a standalone pure function (no worklet/RN types) so it can run
 * identically inside a UI-thread worklet and be unit-tested in plain Node.
 */
export function autoscrollSpeed(distanceFromTop: number, distanceFromBottom: number): number {
  'worklet'
  const zone = AUTOSCROLL.EDGE_ZONE_PX
  if (distanceFromTop >= 0 && distanceFromTop < zone) {
    const proximity = (zone - distanceFromTop) / zone
    return -proximity * AUTOSCROLL.MAX_SPEED_PX
  }
  if (distanceFromBottom >= 0 && distanceFromBottom < zone) {
    const proximity = (zone - distanceFromBottom) / zone
    return proximity * AUTOSCROLL.MAX_SPEED_PX
  }
  return 0
}
