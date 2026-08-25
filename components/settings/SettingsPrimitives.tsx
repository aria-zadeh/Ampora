/**
 * Shared settings presentation primitives — Phase 7 (PRD §8.11 full settings
 * surface). Extracted so SchedulingSettings / NotificationSettings /
 * DataSettings all render with one consistent, premium visual language
 * (grouped white cards, soft shadow, overline headers, -/+ steppers, inline
 * segmented pickers) instead of each re-inventing rows.
 *
 * Everything here is presentation only — no store access, no side effects.
 * RN + NativeWind, web-export safe. Values come from the design tokens; no
 * hardcoded colors beyond the Ionicons `color` prop and the Reanimated
 * `useAnimatedStyle` backgrounds (neither can take a `dark:` class), both of
 * which resolve through `useThemeColors()` so they track the active scheme.
 * className-driven color (background/border/text) uses `dark:` variants
 * directly — see the cheatsheet atop `utils/design-tokens.ts`.
 */

import React, { useEffect } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated'
import { shadows } from '@/utils/design-tokens'
import { EASINGS, DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useThemeColors } from '@/hooks/useThemeColors'

// ---------------------------------------------------------------------------
// Section header + grouped card
// ---------------------------------------------------------------------------

/** Uppercase overline section label, matched to the Profile screen. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text className="mb-2 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500 dark:text-[#78716C]">
      {children}
    </Text>
  )
}

/** A calm caption under a card, for the "why" / reassurance copy. */
export function SectionFootnote({ children }: { children: React.ReactNode }) {
  return (
    <Text className="ml-1 mt-2 text-caption text-neutral-500 dark:text-[#78716C]">
      {children}
    </Text>
  )
}

/**
 * Grouped white card with a soft shadow + 1px border (the default card look).
 * Themed dark in dark mode UNLESS `forceLight` is set — used by the handful
 * of call sites (the `EmptyState`-driven CalendarSyncSettings branches) that
 * wrap a `components/ui/EmptyState`/`Heading`, both outside this task's
 * touch scope and both still hardcoded to dark ink text. Forcing those
 * specific cards to stay light keeps that text readable (a light card on a
 * dark screen) instead of silently going dark-on-dark and disappearing.
 */
export function Group({
  children,
  forceLight = false,
}: {
  children: React.ReactNode
  forceLight?: boolean
}) {
  return (
    <View
      className={
        forceLight
          ? 'rounded-2xl border border-neutral-200 bg-white px-4'
          : 'rounded-2xl border border-neutral-200 bg-white px-4 dark:border-neutral-800 dark:bg-neutral-900'
      }
      style={shadows.sm}
    >
      {children}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

/** A settings row: leading icon bubble, label + optional sublabel, trailing slot. */
export function Row({
  icon,
  iconTint,
  iconBg = 'bg-neutral-100 dark:bg-neutral-800',
  label,
  sublabel,
  trailing,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconTint?: string
  iconBg?: string
  label: string
  sublabel?: string
  trailing?: React.ReactNode
  isLast?: boolean
}) {
  const theme = useThemeColors()
  return (
    <View
      className={`flex-row items-center py-3.5 ${
        isLast ? '' : 'border-b border-neutral-100 dark:border-neutral-800'
      }`}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full ${iconBg}`}>
        <Ionicons name={icon} size={18} color={iconTint ?? theme.textSecondary} />
      </View>
      <View className="ml-3 flex-1 pr-3">
        <Text className="text-body-lg text-neutral-900 dark:text-neutral-50">{label}</Text>
        {sublabel ? (
          <Text className="mt-0.5 text-caption text-neutral-500 dark:text-[#78716C]">
            {sublabel}
          </Text>
        ) : null}
      </View>
      {trailing}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Stepper
// ---------------------------------------------------------------------------

/**
 * A -/+ stepper. Generic over the displayed unit — `format` turns the raw
 * numeric value into its label (e.g. minutes → "1h 30m", weeks → "4 weeks").
 * Clamps to [min, max]; fires selection haptic on a real change.
 */
export function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  format,
  a11yLabel,
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (next: number) => void
  format: (v: number) => string
  a11yLabel: string
}) {
  const atMin = value <= min
  const atMax = value >= max
  const theme = useThemeColors()

  const bump = (dir: -1 | 1) => {
    const next = Math.min(max, Math.max(min, value + dir * step))
    if (next === value) return
    Haptics.selectionAsync().catch(() => {})
    onChange(next)
  }

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => bump(-1)}
        disabled={atMin}
        hitSlop={6}
        className={`h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 ${
          atMin ? 'opacity-40' : 'active:opacity-60'
        }`}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${a11yLabel}`}
        accessibilityState={{ disabled: atMin }}
      >
        <Ionicons name="remove" size={18} color={theme.text} />
      </Pressable>
      <Text
        className="mx-3 min-w-[64px] text-center text-body-lg font-semibold text-neutral-900 dark:text-neutral-50"
        accessibilityLabel={`${a11yLabel}: ${format(value)}`}
      >
        {format(value)}
      </Text>
      <Pressable
        onPress={() => bump(1)}
        disabled={atMax}
        hitSlop={6}
        className={`h-9 w-9 items-center justify-center rounded-full border border-neutral-200 dark:border-neutral-700 ${
          atMax ? 'opacity-40' : 'active:opacity-60'
        }`}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${a11yLabel}`}
        accessibilityState={{ disabled: atMax }}
      >
        <Ionicons name="add" size={18} color={theme.text} />
      </Pressable>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Inline two-option segmented control (compact, fits in a row's trailing slot)
// ---------------------------------------------------------------------------

/** A compact pill segmented control for a small closed set of choices. */
export function InlineSegmented<T extends string>({
  value,
  options,
  onChange,
  a11yLabel,
}: {
  value: T
  options: { key: T; label: string }[]
  onChange: (key: T) => void
  a11yLabel: string
}) {
  const theme = useThemeColors()
  const select = (key: T) => {
    if (key === value) return
    Haptics.selectionAsync().catch(() => {})
    onChange(key)
  }
  return (
    <View
      className="flex-row rounded-lg border border-neutral-200 bg-neutral-100 dark:border-neutral-800 dark:bg-neutral-950 p-0.5"
      accessibilityLabel={a11yLabel}
    >
      {options.map((opt) => {
        const active = opt.key === value
        return (
          <Pressable
            key={opt.key}
            onPress={() => select(opt.key)}
            className="min-h-9 items-center justify-center rounded-md px-3 py-1.5"
            style={active ? [{ backgroundColor: theme.elevated }, shadows.xs] : undefined}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${opt.label}${active ? ', selected' : ''}`}
          >
            <Text
              className={
                active
                  ? 'text-label font-semibold text-neutral-900 dark:text-neutral-50'
                  : 'text-label font-medium text-neutral-500 dark:text-[#78716C]'
              }
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ---------------------------------------------------------------------------
// Toggle (switch)
// ---------------------------------------------------------------------------

/**
 * A track-and-thumb toggle switch matching the app's calm, springless
 * settings motion (eased withTiming, not a spring — a switch here is a
 * settings commit, not a tactile drag control). Track tints primary-600 when
 * on, neutral-200 when off; thumb is always white. Reduce-motion collapses
 * the transition to an instant snap.
 */
export function Toggle({
  value,
  onChange,
  a11yLabel,
  disabled = false,
}: {
  value: boolean
  onChange: (next: boolean) => void
  a11yLabel: string
  disabled?: boolean
}) {
  const reduceMotion = useReduceMotion()
  const theme = useThemeColors()
  const progress = useSharedValue(value ? 1 : 0)

  useEffect(() => {
    const target = value ? 1 : 0
    progress.value = reduceMotion
      ? target
      : withTiming(target, { duration: DURATIONS.fast, easing: EASINGS.standard })
  }, [value, reduceMotion, progress])

  // `theme` in the dependency array makes this worklet re-derive when the
  // color scheme flips — a plain hook return isn't itself reactive to
  // Reanimated the way a SharedValue is, so without the explicit deps this
  // would freeze at whichever scheme was active on first mount.
  const trackStyle = useAnimatedStyle(
    () => ({
      backgroundColor: progress.value > 0.5 ? theme.primary : theme.border,
    }),
    [theme]
  )
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * 20 }],
  }))

  const toggle = () => {
    if (disabled) return
    Haptics.selectionAsync().catch(() => {})
    onChange(!value)
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="switch"
      accessibilityLabel={a11yLabel}
      accessibilityState={{ checked: value, disabled }}
      className={disabled ? 'opacity-40' : ''}
    >
      <Animated.View
        style={trackStyle}
        className="h-7 w-[46px] justify-center rounded-full px-0.5"
      >
        <Animated.View
          style={[thumbStyle, shadows.xs]}
          className="h-6 w-6 rounded-full bg-white"
        />
      </Animated.View>
    </Pressable>
  )
}

// ---------------------------------------------------------------------------
// Formatting helpers (shared)
// ---------------------------------------------------------------------------

/** "1h 30m" / "45m" / "0m" style label for a minutes value. */
export function formatMinutes(min: number): string {
  const h = Math.floor(min / 60)
  const m = min % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

/** "23:00" style clock label for a minutes-from-midnight value. */
export function formatClock(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60) % 24
  const m = minutesFromMidnight % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}
