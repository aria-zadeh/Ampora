/**
 * NotificationSettings — §8.11 notification cadence (Phase 7, PRD FR-63 / FR-65).
 *
 * Exposes:
 * - A ONE-TIME calm nudge when OS/browser notification permission is denied
 *   (audit GAP). Shown until dismissed, then never again — reads
 *   `Settings.notificationNudgeDismissed` so it never nags (PRD §8.9).
 * - Reminder types — per-kind toggles for the three proactive nudges
 *   (`Settings.reminderKinds`, audit GAP). "Completion celebrate" isn't
 *   listed: it's a direct response to finishing a task, not a proactive
 *   nudge, so there's nothing to opt out of.
 * - Max notifications per hour — the rate-limit ceiling the notification
 *   scheduler respects (`Settings.maxNotificationsPerHour`, FR-63).
 * - Quiet hours summary — read-only preview of the window where reminders (and
 *   stakes) rest; editing quiet hours lives with Stakes / Busy times, so this is
 *   a summary only to avoid two sources of truth.
 *
 * Writes through `useSettingsStore.updateSettings`. Warm, protective framing:
 * fewer, well-timed nudges beat a firehose. Embeds under its own section header
 * (renders its own cards, like StakesSettings). RN + NativeWind, web-safe.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Linking, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated'
import { useSettingsStore } from '@/store/settingsStore'
import { getNotificationPermissionStatus } from '@/services/notifications'
import { PressableScale } from '@/components/ui/PressableScale'
import { colors, shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import {
  SectionLabel,
  SectionFootnote,
  Group,
  Row,
  Stepper,
  Toggle,
  formatClock,
} from '@/components/settings/SettingsPrimitives'

const RATE_MIN = 0
const RATE_MAX = 6

/** "1 / hour" / "Off" style label for the per-hour rate. */
function formatRate(perHour: number): string {
  if (perHour <= 0) return 'Off'
  return `${perHour}/hr`
}

/**
 * One-time calm nudge shown only while permission reads 'denied' AND the user
 * hasn't already dismissed it. Never re-appears after Dismiss, even if
 * permission is still denied on a later visit — the whole point is to ask
 * once, not nag (PRD §8.9).
 */
function PermissionNudge() {
  const reduceMotion = useReduceMotion()
  const dismissed = useSettingsStore((s) => s.settings.notificationNudgeDismissed)
  const updateSettings = useSettingsStore((s) => s.updateSettings)
  const [status, setStatus] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported'>(
    'unsupported'
  )

  useEffect(() => {
    let mounted = true
    getNotificationPermissionStatus().then((s) => {
      if (mounted) setStatus(s)
    })
    return () => {
      mounted = false
    }
  }, [])

  const dismiss = () => {
    Haptics.selectionAsync().catch(() => {})
    updateSettings({ notificationNudgeDismissed: true })
  }

  const openSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    if (Platform.OS !== 'web') {
      Linking.openSettings().catch(() => {})
    }
    // Opening Settings isn't a promise the user turned it on — leave the card
    // dismissable rather than assuming success, so the user drives the close.
  }

  if (status !== 'denied' || dismissed) return null

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
      exiting={reduceMotion ? undefined : FadeOut.duration(DURATIONS.fast)}
      className="mb-6 rounded-2xl border border-warning-100 bg-white p-4"
      style={shadows.sm}
    >
      <View className="flex-row items-start">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-warning-100">
          <Ionicons name="notifications-off-outline" size={18} color={colors.light.warningStrong} />
        </View>
        <View className="ml-3 flex-1">
          <Text className="text-body-lg font-medium text-neutral-900">
            Notifications are off
          </Text>
          <Text className="mt-1 text-body text-neutral-500">
            Turn them on in Settings to get first-move nudges and deadline
            reminders. Ampora still works fine without them.
          </Text>
          <View className="-ml-2 mt-2 flex-row items-center">
            <PressableScale
              onPress={openSettings}
              haptic="light"
              className="min-h-11 justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Open device settings to turn on notifications"
            >
              <Text className="text-label font-semibold text-primary-600">
                Open Settings
              </Text>
            </PressableScale>
            <PressableScale
              onPress={dismiss}
              haptic="light"
              className="min-h-11 justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Dismiss this notice"
            >
              <Text className="text-label font-medium text-neutral-500">Dismiss</Text>
            </PressableScale>
          </View>
        </View>
      </View>
    </Animated.View>
  )
}

export function NotificationSettings() {
  const maxPerHour = useSettingsStore((s) => s.settings.maxNotificationsPerHour)
  const quietHours = useSettingsStore((s) => s.settings.quietHours)
  const reminderKinds = useSettingsStore((s) => s.settings.reminderKinds)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const quietLabel = useMemo(
    () => `${formatClock(quietHours.start)} – ${formatClock(quietHours.end)}`,
    [quietHours.start, quietHours.end]
  )

  // Missing key reads as ON (matches the gate in services/notifications.ts).
  const startOn = reminderKinds?.start !== false
  const deadlineOn = reminderKinds?.deadline !== false
  const motivationOn = reminderKinds?.motivation !== false

  const setKind = (kind: 'start' | 'deadline' | 'motivation', on: boolean) =>
    updateSettings({
      reminderKinds: {
        start: startOn,
        deadline: deadlineOn,
        motivation: motivationOn,
        [kind]: on,
      },
    })

  return (
    <View>
      <PermissionNudge />

      <Text className="mb-4 text-body text-neutral-500">
        Ampora keeps reminders rare and well-timed. Fewer nudges you actually
        notice beat a stream you learn to ignore.
      </Text>

      {/* Reminder types ------------------------------------------------------ */}
      <SectionLabel>Reminder types</SectionLabel>
      <Group>
        <Row
          icon="flash-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="First-move nudge"
          sublabel="A gentle prompt at your best focus time"
          trailing={
            <Toggle
              value={startOn}
              onChange={(v) => setKind('start', v)}
              a11yLabel="First-move nudge"
            />
          }
        />
        <Row
          icon="alert-circle-outline"
          iconTint={colors.light.warningAccent}
          iconBg="bg-warning-100"
          label="Deadline approaching"
          sublabel="A heads-up about 12 hours before it's due"
          trailing={
            <Toggle
              value={deadlineOn}
              onChange={(v) => setKind('deadline', v)}
              a11yLabel="Deadline approaching reminder"
            />
          }
        />
        <Row
          icon="heart-outline"
          iconTint={colors.light.accentStrong}
          iconBg="bg-accent-100"
          label="Motivation nudge"
          sublabel="A warm check-in if a task sits untouched a day"
          trailing={
            <Toggle
              value={motivationOn}
              onChange={(v) => setKind('motivation', v)}
              a11yLabel="Motivation nudge"
            />
          }
          isLast
        />
      </Group>
      <SectionFootnote>
        Turning all three off stops proactive nudges. You'll still hear from
        Ampora the moment you finish something.
      </SectionFootnote>

      {/* Cadence ------------------------------------------------------------ */}
      <View className="mt-6">
        <SectionLabel>Cadence</SectionLabel>
      </View>
      <Group>
        <Row
          icon="notifications-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="Reminders per hour"
          sublabel={
            maxPerHour <= 0
              ? 'Reminders are turned off'
              : 'The most Ampora will ever send in an hour'
          }
          trailing={
            <Stepper
              value={maxPerHour}
              min={RATE_MIN}
              max={RATE_MAX}
              step={1}
              onChange={(v) => updateSettings({ maxNotificationsPerHour: v })}
              format={formatRate}
              a11yLabel="reminders per hour"
            />
          }
          isLast
        />
      </Group>
      <SectionFootnote>
        Set to Off for total quiet. A truly urgent, soon-due task can still raise
        its own reminder.
      </SectionFootnote>

      {/* Quiet hours (read-only summary) ----------------------------------- */}
      <View className="mt-6">
        <SectionLabel>Quiet hours</SectionLabel>
      </View>
      <Group>
        <Row
          icon="moon-outline"
          label="No reminders during"
          sublabel="Reminders and stakes both rest in this window"
          trailing={
            <Text className="text-body font-medium text-neutral-500">
              {quietLabel}
            </Text>
          }
          isLast
        />
      </Group>
      <SectionFootnote>
        Quiet hours are shared with Focus stakes. Adjust them there.
      </SectionFootnote>
    </View>
  )
}
