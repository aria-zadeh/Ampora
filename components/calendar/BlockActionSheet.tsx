/**
 * BlockActionSheet — the calendar block's long-press / "…" action menu
 * (Round A, FlowSavvy parity + better).
 *
 * A calm bottom sheet opened from a scheduled block. It exposes the actions a
 * user reaches for when a plan needs adjusting, without leaving the calendar:
 *
 *   • Postpone to…   — a quick set (+1h, This evening, Tomorrow) plus a custom
 *                      time. Postponing sets the task's `startAfter` lower bound
 *                      (so the scheduler never re-places it before that instant,
 *                      PRD §9.5.3) AND moves the block there now (FlowSavvy
 *                      "push it later"). The block pins as part of the move.
 *   • Lock / Unlock   — a TOGGLE (Round B fix #7): pins the block (setPinned
 *                      true) so recompute treats it as an immovable input
 *                      (FlowSavvy "lock started blocks"), or unpins it so the
 *                      next recompute can move it again.
 *   • Open           — push the task detail route.
 *   • Mark complete  — completeTask (rolls up subtasks, doc 07 Part 3.5).
 *   • Delete         — deleteTask.
 *
 * The sheet is presentational: every mutation is delegated to a callback the
 * caller wires to the stores (`onPostpone`, `onTogglePin`, `onOpen`,
 * `onComplete`, `onDelete`), keeping this file store-agnostic and easy to
 * reuse from both the Day and 3-Day layers.
 *
 * RN + NativeWind, web-export safe. No native module imported (the custom-time
 * path uses the cross-platform DateTimePicker already in the design system).
 * Reuses the design system (Heading, PressableScale, Badge, shadows, motion).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'

import { Heading } from '@/components/ui/Heading'
import { PressableScale } from '@/components/ui/PressableScale'
import { Button } from '@/components/ui/Button'
import { DateTimePickerCrossPlatform } from '@/components/ui/DateTimePickerCrossPlatform'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { MS_PER_HOUR } from '@/core/calendar'
import { formatBlockTimeRange, formatClockTime } from './hours'
import type { ScheduledBlock, Task } from '@/types'

// ---------------------------------------------------------------------------
// Postpone target computation — pure, "now"-driven so it is predictable.
// ---------------------------------------------------------------------------

/** The quick-set postpone options offered as chips. */
type PostponeKey = 'plus1h' | 'evening' | 'tomorrow'

/** Local hour (24h) that "This evening" targets. */
const EVENING_HOUR = 18
/** Local hour (24h) that "Tomorrow" targets (a gentle morning start). */
const TOMORROW_HOUR = 9

/** Local midnight of the day containing epoch-ms `t`. */
function localDayStart(t: number): number {
  const d = new Date(t)
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

/** Epoch ms for a given local hour on the same day as `t`. */
function atHour(t: number, hour: number): number {
  const d = new Date(t)
  d.setHours(hour, 0, 0, 0)
  return d.getTime()
}

/**
 * Resolve a quick-set key to an epoch-ms instant, relative to the block's
 * current start (so "+1h" nudges from where it sits, and evening/tomorrow are
 * absolute clock targets). Never returns a time in the past relative to `now`.
 */
function resolvePostpone(key: PostponeKey, blockStart: number, now: number): number {
  switch (key) {
    case 'plus1h':
      return Math.max(now, blockStart) + MS_PER_HOUR
    case 'evening': {
      const target = atHour(blockStart, EVENING_HOUR)
      // If the block already sits past this evening's target, push to tomorrow evening.
      return target > Math.max(now, blockStart) ? target : atHour(localDayStart(blockStart) + 86_400_000, EVENING_HOUR)
    }
    case 'tomorrow':
      return atHour(localDayStart(Math.max(now, blockStart)) + 86_400_000, TOMORROW_HOUR)
  }
}

/** Short human label for a resolved postpone instant, e.g. "Tomorrow, 9:00 AM". */
function describeInstant(ms: number, now: number): string {
  const dayDelta = Math.round((localDayStart(ms) - localDayStart(now)) / 86_400_000)
  const time = formatClockTime(ms)
  if (dayDelta <= 0) return `Today, ${time}`
  if (dayDelta === 1) return `Tomorrow, ${time}`
  const d = new Date(ms)
  const weekday = d.toLocaleDateString(undefined, { weekday: 'short' })
  return `${weekday}, ${time}`
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface BlockActionSheetProps {
  visible: boolean
  /** The block the actions target. Null while closed (sheet renders nothing). */
  block: ScheduledBlock | null
  /** The owning task, for the title + completion / delete affordances. */
  task: Task | null
  onClose: () => void
  /**
   * Postpone: the user picked a new earliest instant. The caller should set
   * `task.startAfter` to `newStart` AND move the block to `newStart` (pinning
   * it), so the plan updates immediately and future recomputes respect it.
   */
  onPostpone: (newStart: number) => void
  /**
   * Toggle the block's pinned flag. Called with the NEXT desired state: `true`
   * to pin it at its current time (immovable input to recompute), `false` to
   * unlock it so recompute can move it again.
   */
  onTogglePin: (pinned: boolean) => void
  /** Open the task's detail screen. */
  onOpen: () => void
  /** Mark the whole task complete. */
  onComplete: () => void
  /** Delete the task (removes it and its blocks). */
  onDelete: () => void
  /** "now" override for tests/determinism; defaults to Date.now(). */
  now?: number
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function BlockActionSheet({
  visible,
  block,
  task,
  onClose,
  onPostpone,
  onTogglePin,
  onOpen,
  onComplete,
  onDelete,
  now,
}: BlockActionSheetProps) {
  const reduceMotion = useReduceMotion()
  const [pickingTime, setPickingTime] = useState(false)
  // Draft instant for the custom-time path (committed only via "Set time"), so
  // the date/time wheels can be adjusted without prematurely moving the block.
  const [draft, setDraft] = useState<Date>(() => new Date())

  const nowMs = now ?? Date.now()
  const isPinned = block?.pinned === true

  // Re-seed local UI each time the sheet (re)opens for a block.
  useEffect(() => {
    if (!visible) return
    setPickingTime(false)
    setDraft(new Date(Math.max(nowMs, block?.start ?? nowMs)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, block?.id])

  // Quick-set postpone options, resolved against this block + now.
  const postponeOptions = useMemo(() => {
    if (!block) return []
    const opts: { key: PostponeKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
      { key: 'plus1h', label: '+1 hour', icon: 'arrow-forward-outline' },
      { key: 'evening', label: 'This evening', icon: 'moon-outline' },
      { key: 'tomorrow', label: 'Tomorrow', icon: 'sunny-outline' },
    ]
    return opts.map((o) => ({ ...o, at: resolvePostpone(o.key, block.start, nowMs) }))
  }, [block, nowMs])

  if (!block || !task) return null

  const title = task.title || 'Untitled'
  const timeRange = formatBlockTimeRange(block.start, block.end)

  const handlePostpone = (at: number) => {
    Haptics.selectionAsync().catch(() => {})
    onPostpone(at)
    onClose()
  }

  const handleTogglePin = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onTogglePin(!isPinned)
    onClose()
  }

  const handleOpen = () => {
    onOpen()
    onClose()
  }

  const handleComplete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    onComplete()
    onClose()
  }

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    onDelete()
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={['bottom']}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                </View>

                {/* Header: task title + time range */}
                <View className="flex-row items-start justify-between px-5 pb-1 pt-3">
                  <View className="flex-1 pr-3">
                    <Heading size="h3" numberOfLines={2}>
                      {title}
                    </Heading>
                    <Text className="mt-1 text-caption text-neutral-500">{timeRange}</Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color="#52525B" />
                  </Pressable>
                </View>

                <View className="px-5 pb-4 pt-3">
                  {/* --- Postpone to… --- */}
                  <Text className="mb-2 px-1 text-label font-semibold text-neutral-700">Postpone to</Text>
                  <View className="flex-row gap-2">
                    {postponeOptions.map((o) => (
                      <PressableScale
                        key={o.key}
                        onPress={() => handlePostpone(o.at)}
                        haptic={false}
                        className="flex-1 items-center gap-1 rounded-xl border border-neutral-200 bg-white px-2 py-3"
                        style={shadows.xs}
                        accessibilityRole="button"
                        accessibilityLabel={`Postpone to ${describeInstant(o.at, nowMs)}`}
                      >
                        <Ionicons name={o.icon} size={18} color="#2563EB" />
                        <Text className="text-caption font-medium text-neutral-800" numberOfLines={1}>
                          {o.label}
                        </Text>
                      </PressableScale>
                    ))}
                  </View>

                  {/* Custom time row */}
                  <PressableScale
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {})
                      setPickingTime((v) => !v)
                    }}
                    haptic={false}
                    className={`mt-2 flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                      pickingTime ? 'border-primary-300 bg-primary-50' : 'border-neutral-200 bg-white'
                    }`}
                    style={pickingTime ? undefined : shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Pick a specific time to postpone to"
                    accessibilityState={{ expanded: pickingTime }}
                  >
                    <Ionicons name="time-outline" size={20} color="#2563EB" />
                    <Text className="flex-1 text-body font-medium text-neutral-800">Pick a time…</Text>
                    <Ionicons
                      name={pickingTime ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#A1A1AA"
                    />
                  </PressableScale>

                  {pickingTime ? (
                    <Animated.View
                      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
                      className="mt-2 rounded-xl border border-neutral-200 bg-white p-3"
                      style={shadows.xs}
                    >
                      <View className="flex-row gap-2">
                        <View className="flex-1">
                          <Text className="mb-1 px-1 text-caption font-medium text-neutral-500">Day</Text>
                          <DateTimePickerCrossPlatform
                            mode="date"
                            value={draft}
                            minimumDate={new Date(nowMs)}
                            onChange={setDraft}
                            accessibilityLabel="Postpone date"
                          />
                        </View>
                        <View className="flex-1">
                          <Text className="mb-1 px-1 text-caption font-medium text-neutral-500">Time</Text>
                          <DateTimePickerCrossPlatform
                            mode="time"
                            value={draft}
                            onChange={setDraft}
                            accessibilityLabel="Postpone time"
                          />
                        </View>
                      </View>
                      <View className="mt-3">
                        <Button
                          title={`Set to ${describeInstant(Math.max(nowMs, draft.getTime()), nowMs)}`}
                          variant="primaryBlue"
                          size="md"
                          onPress={() => handlePostpone(Math.max(nowMs, draft.getTime()))}
                          accessibilityLabel="Postpone to the selected time"
                        />
                      </View>
                    </Animated.View>
                  ) : null}

                  {/* --- Primary actions --- */}
                  <View className="mt-4 gap-2">
                    <ActionRow
                      icon={isPinned ? 'lock-closed' : 'lock-closed-outline'}
                      label={isPinned ? 'Unlock' : 'Lock at this time'}
                      blurb={
                        isPinned
                          ? 'Locked — rebuilding the schedule won\'t move it. Tap to unlock.'
                          : "Keep this block here — rebuilding the schedule won't move it."
                      }
                      onPress={handleTogglePin}
                      active={isPinned}
                      tint="primary"
                    />
                    <ActionRow
                      icon="open-outline"
                      label="Open task"
                      onPress={handleOpen}
                    />
                    <ActionRow
                      icon="checkmark-circle-outline"
                      label="Mark complete"
                      onPress={handleComplete}
                      tint="success"
                    />
                    <ActionRow
                      icon="trash-outline"
                      label="Delete task"
                      onPress={handleDelete}
                      tint="danger"
                    />
                  </View>
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Action row
// ---------------------------------------------------------------------------

type Tint = 'neutral' | 'primary' | 'success' | 'danger'

const TINT_STYLES: Record<Tint, { icon: string; iconBg: string; text: string }> = {
  neutral: { icon: '#3F3F46', iconBg: 'bg-neutral-100', text: 'text-neutral-900' },
  primary: { icon: '#2563EB', iconBg: 'bg-primary-100', text: 'text-neutral-900' },
  success: { icon: '#15803D', iconBg: 'bg-success-100', text: 'text-neutral-900' },
  danger: { icon: '#DC2626', iconBg: 'bg-danger-100', text: 'text-danger-700' },
}

function ActionRow({
  icon,
  label,
  blurb,
  onPress,
  disabled,
  /** True when this row represents a toggle that is currently ON (e.g. "Locked"). Tints the row instead of dimming it. */
  active,
  tint = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  blurb?: string
  onPress: () => void
  disabled?: boolean
  active?: boolean
  tint?: Tint
}) {
  const t = TINT_STYLES[tint]
  return (
    <PressableScale
      onPress={disabled ? undefined : onPress}
      haptic={false}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
        disabled
          ? 'border-neutral-200 bg-white opacity-60'
          : active
            ? 'border-primary-300 bg-primary-50'
            : 'border-neutral-200 bg-white'
      }`}
      style={active ? undefined : shadows.xs}
      accessibilityRole={active != null ? 'switch' : 'button'}
      accessibilityLabel={blurb ? `${label}. ${blurb}` : label}
      accessibilityState={{ disabled, checked: active }}
    >
      <View className={`h-10 w-10 items-center justify-center rounded-full ${t.iconBg}`}>
        <Ionicons name={icon} size={20} color={t.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${t.text}`}>{label}</Text>
        {blurb ? (
          <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={2}>
            {blurb}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  )
}
