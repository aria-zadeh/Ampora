/**
 * NotificationSettings — §8.11 notification cadence (Phase 7, PRD FR-63 / FR-65).
 *
 * Exposes:
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

import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useSettingsStore } from '@/store/settingsStore'
import {
  SectionLabel,
  SectionFootnote,
  Group,
  Row,
  Stepper,
  formatClock,
} from '@/components/settings/SettingsPrimitives'

const RATE_MIN = 0
const RATE_MAX = 6

/** "1 / hour" / "Off" style label for the per-hour rate. */
function formatRate(perHour: number): string {
  if (perHour <= 0) return 'Off'
  return `${perHour}/hr`
}

export function NotificationSettings() {
  const maxPerHour = useSettingsStore((s) => s.settings.maxNotificationsPerHour)
  const quietHours = useSettingsStore((s) => s.settings.quietHours)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const quietLabel = useMemo(
    () => `${formatClock(quietHours.start)} – ${formatClock(quietHours.end)}`,
    [quietHours.start, quietHours.end]
  )

  return (
    <View>
      <Text className="mb-4 text-body text-neutral-500">
        Ampora keeps reminders rare and well-timed. Fewer nudges you actually
        notice beat a stream you learn to ignore.
      </Text>

      {/* Cadence ------------------------------------------------------------ */}
      <SectionLabel>Cadence</SectionLabel>
      <Group>
        <Row
          icon="notifications-outline"
          iconTint="#2563EB"
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
