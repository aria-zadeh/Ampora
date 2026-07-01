import React, { useCallback, useMemo } from 'react'
import { View, Text } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { Heading } from '@/components/ui/Heading'
import { SegmentedControl } from '@/components/ui/SegmentedControl'
import { PressableScale } from '@/components/ui/PressableScale'
import { dayStart, isSameDay } from './hours'

/** The five calendar views (PRD FR-23). `3day` is the phone default. */
export type CalendarView = 'day' | '3day' | 'week' | 'month' | 'agenda'

/** Segment order + labels for the view pill (PRD FR-23). */
const VIEW_SEGMENTS: { key: CalendarView; label: string }[] = [
  { key: 'day', label: 'Day' },
  { key: '3day', label: '3-Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
  { key: 'agenda', label: 'Agenda' },
]

interface CalendarHeaderProps {
  /** Currently selected view. */
  view: CalendarView
  onViewChange: (view: CalendarView) => void
  /** The anchor date of the visible range, epoch ms. */
  date: number
  /** Fired with a new anchor date (epoch ms) on prev/next/today. */
  onDateChange: (date: number) => void
  testID?: string
}

/** How many days prev/next moves per view. */
const STEP_DAYS: Record<CalendarView, number> = {
  day: 1,
  '3day': 3,
  week: 7,
  month: 30, // month view re-anchors by ~a month; caller may normalize to 1st
  agenda: 7,
}

function shiftDate(date: number, view: CalendarView, dir: 1 | -1): number {
  const d = new Date(dayStart(date))
  if (view === 'month') {
    d.setMonth(d.getMonth() + dir)
  } else {
    d.setDate(d.getDate() + dir * STEP_DAYS[view])
  }
  return d.getTime()
}

/** Title for the visible range: "Monday, Jun 30", "Jun 2026", etc. */
function formatTitle(date: number, view: CalendarView): string {
  const d = new Date(date)
  if (view === 'month') {
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  }
  if (view === 'week' || view === '3day') {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }
  // Day / agenda: weekday + date.
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })
}

/**
 * Premium calendar header (PRD FR-23): a big tight date title, prev/next/today
 * navigation, and the Day / 3-Day / Week / Month / Agenda view pill.
 *
 * Presentational + controlled: it owns no state; the parent screen holds `view`
 * and `date` (persisting "last view" per FR-23) and reacts to the callbacks.
 */
export function CalendarHeader({
  view,
  onViewChange,
  date,
  onDateChange,
  testID,
}: CalendarHeaderProps) {
  const title = useMemo(() => formatTitle(date, view), [date, view])
  const isToday = isSameDay(date, Date.now())

  const go = useCallback(
    (dir: 1 | -1) => {
      Haptics.selectionAsync().catch(() => {})
      onDateChange(shiftDate(date, view, dir))
    },
    [date, view, onDateChange]
  )

  const goToday = useCallback(() => {
    if (isToday) return
    Haptics.selectionAsync().catch(() => {})
    onDateChange(dayStart(Date.now()))
  }, [isToday, onDateChange])

  return (
    <View testID={testID} className="px-5 pt-2 pb-3 bg-neutral-100">
      <View className="flex-row items-center justify-between mb-3">
        <Heading size="h2" className="flex-1" numberOfLines={1}>
          {title}
        </Heading>

        <View className="flex-row items-center">
          <NavButton icon="chevron-back" label="Previous" onPress={() => go(-1)} />

          <PressableScale
            onPress={goToday}
            haptic={false}
            disabled={isToday}
            accessibilityRole="button"
            accessibilityLabel="Go to today"
            accessibilityState={{ disabled: isToday }}
            className={`mx-1 px-3 h-9 rounded-full items-center justify-center border ${
              isToday ? 'border-neutral-200 bg-neutral-100' : 'border-neutral-300 bg-white'
            }`}
          >
            <Text
              className={`text-label font-medium ${isToday ? 'text-neutral-400' : 'text-neutral-700'}`}
            >
              Today
            </Text>
          </PressableScale>

          <NavButton icon="chevron-forward" label="Next" onPress={() => go(1)} />
        </View>
      </View>

      <SegmentedControl
        segments={VIEW_SEGMENTS}
        value={view}
        onChange={(k) => onViewChange(k as CalendarView)}
      />
    </View>
  )
}

/** Round 36px icon nav button (>= 44px hit area via hitSlop in PressableScale's Pressable). */
function NavButton({
  icon,
  label,
  onPress,
}: {
  icon: 'chevron-back' | 'chevron-forward'
  label: string
  onPress: () => void
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="w-9 h-9 rounded-full items-center justify-center bg-white border border-neutral-200"
    >
      <Ionicons name={icon} size={18} color="#3F3F46" />
    </PressableScale>
  )
}
