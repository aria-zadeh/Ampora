/**
 * CalendarSyncSettings — read-only device calendar sync (PRD FR-22, §8.6).
 *
 * Ampora does not run its own Google/Outlook/iCloud OAuth. Instead it reads
 * the calendars already synced onto the device: once the user has signed
 * into a Google, Outlook, or iCloud account at the OS level, that account's
 * calendars land in the same on-device calendar database, so one permission
 * prompt covers all three providers. `services/calendarSync.ts` does the
 * actual reading; this screen is the permission + per-calendar picker UI.
 *
 * States:
 * - unsupported (web): calendar sync needs the phone app — calm explainer,
 *   no dead-end (FR-64).
 * - unrequested / denied: an honest explainer + a single primary action
 *   (request permission, or open Settings if already denied).
 * - granted: a per-calendar toggle list (never auto-select — a birthdays or
 *   holidays calendar would block the whole schedule), a last-synced line
 *   with a manual "Sync now", and a "Disconnect" action that clears the
 *   selection (Ampora-side only; it cannot revoke the OS permission).
 *
 * Selecting/deselecting a calendar writes `settingsStore.calendarSyncCalendarIds`;
 * `scheduleStore.ts` already reacts to that change (refetches + recomputes),
 * so this screen only ever touches settings state, never the schedule store
 * directly (aside from reading the last-synced timestamp and the manual sync
 * button, both plain reads/calls of an existing action).
 *
 * Embeds under its own section header on the Profile screen (renders its own
 * grouped white card, like StakesSettings/NotificationSettings). RN +
 * NativeWind, web-export safe.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { Linking, Platform, Text, View } from 'react-native'

import { useSettingsStore } from '@/store/settingsStore'
import { useScheduleStore } from '@/store/scheduleStore'
import * as calendarSync from '@/services/calendarSync'
import type { CalendarPermissionStatus, DeviceCalendar } from '@/services/calendarSync'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { PressableScale } from '@/components/ui/PressableScale'
import {
  Group,
  Row,
  SectionFootnote,
  Toggle,
} from '@/components/settings/SettingsPrimitives'

/** "Synced just now" / "Synced 12m ago" / "Synced 3h ago" / a short date past a day. */
function formatSyncedAt(ms: number | null): string {
  if (ms == null) return 'Not synced yet'
  const diffMs = Date.now() - ms
  const diffMin = Math.round(diffMs / 60_000)
  if (diffMin < 1) return 'Synced just now'
  if (diffMin < 60) return `Synced ${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `Synced ${diffHr}h ago`
  const date = new Date(ms)
  return `Synced ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
}

export function CalendarSyncSettings() {
  const calendarSyncCalendarIds = useSettingsStore((s) => s.calendarSyncCalendarIds)
  const setCalendarSyncCalendarIds = useSettingsStore((s) => s.setCalendarSyncCalendarIds)
  const externalEventsSyncedAt = useScheduleStore((s) => s.externalEventsSyncedAt)

  const [status, setStatus] = useState<CalendarPermissionStatus | 'loading'>('loading')
  const [calendars, setCalendars] = useState<DeviceCalendar[]>([])
  const [calendarsLoading, setCalendarsLoading] = useState(false)

  const loadCalendars = useCallback(() => {
    setCalendarsLoading(true)
    calendarSync
      .listCalendars()
      .then(setCalendars)
      .finally(() => setCalendarsLoading(false))
  }, [])

  // On mount: read current permission status, and if already granted from a
  // prior visit, load the calendar list right away.
  useEffect(() => {
    let mounted = true
    calendarSync.getPermissionStatus().then((s) => {
      if (!mounted) return
      setStatus(s)
      if (s === 'granted') loadCalendars()
    })
    return () => {
      mounted = false
    }
  }, [loadCalendars])

  // `Button` (used for the request-access / open-settings CTA below) already
  // fires its own press haptic, so these handlers don't fire a second one.
  const requestAccess = useCallback(() => {
    calendarSync.requestPermission().then((s) => {
      setStatus(s)
      if (s === 'granted') loadCalendars()
    })
  }, [loadCalendars])

  const openSettings = useCallback(() => {
    if (Platform.OS !== 'web') Linking.openSettings().catch(() => {})
  }, [])

  const toggleCalendar = useCallback(
    (id: string) => {
      // `Toggle` fires its own selection haptic.
      const next = calendarSyncCalendarIds.includes(id)
        ? calendarSyncCalendarIds.filter((c) => c !== id)
        : [...calendarSyncCalendarIds, id]
      setCalendarSyncCalendarIds(next)
    },
    [calendarSyncCalendarIds, setCalendarSyncCalendarIds]
  )

  // `PressableScale` (used below) already fires its own press haptic.
  const disconnect = useCallback(() => {
    setCalendarSyncCalendarIds([])
  }, [setCalendarSyncCalendarIds])

  const syncNow = useCallback(() => {
    useScheduleStore.getState().refreshExternalEvents()
  }, [])

  // --- Web / unsupported: calm explainer, no dead end (FR-64). -------------
  if (status === 'unsupported') {
    return (
      <Group>
        <EmptyState
          icon="calendar-outline"
          title="Calendar sync needs the phone app"
          subtitle="Ampora reads your device calendar to plan around your classes. Open Ampora on your iPhone or Android phone to connect one."
        />
      </Group>
    )
  }

  // --- Still checking permission on mount. ---------------------------------
  if (status === 'loading') {
    return null
  }

  // --- Not yet granted (never asked, or previously denied). ----------------
  if (status !== 'granted') {
    const denied = status === 'denied'
    return (
      <View>
        <EmptyState
          icon="calendar-outline"
          title="See your classes automatically"
          subtitle="Ampora reads your calendar so it never schedules study sessions over your classes or existing events. It only reads — Ampora never adds, changes, or deletes anything on your calendar."
        />
        <View className="mt-2 items-center">
          <Button
            title={denied ? 'Open Settings' : 'Allow calendar access'}
            variant="primaryBlue"
            onPress={denied ? openSettings : requestAccess}
            accessibilityLabel={
              denied ? 'Open device settings to allow calendar access' : 'Allow calendar access'
            }
          />
        </View>
        {denied && (
          <SectionFootnote>
            Calendar access was turned off. Turn it back on in Settings to connect a calendar.
          </SectionFootnote>
        )}
      </View>
    )
  }

  // --- Granted: per-calendar picker. ----------------------------------------
  return (
    <View>
      <Text className="mb-4 text-body text-neutral-500">
        Choose which calendars count as busy time. Ampora only reads them — it
        never changes anything on your device calendar.
      </Text>

      {calendarsLoading && calendars.length === 0 ? null : calendars.length === 0 ? (
        <Group>
          <EmptyState
            icon="calendar-clear-outline"
            title="No calendars found"
            subtitle="This device doesn't have any calendars set up yet. Add a Google, Outlook, or iCloud account in your phone's Settings, then come back here."
          />
        </Group>
      ) : (
        <Group>
          {calendars.map((cal, i) => (
            <Row
              key={cal.id}
              icon="calendar-outline"
              iconTint={cal.color || '#57534E'}
              iconBg="bg-neutral-100"
              label={cal.title}
              sublabel={cal.sourceName}
              isLast={i === calendars.length - 1}
              trailing={
                <Toggle
                  value={calendarSyncCalendarIds.includes(cal.id)}
                  onChange={() => toggleCalendar(cal.id)}
                  a11yLabel={`Sync ${cal.title} calendar`}
                />
              }
            />
          ))}
        </Group>
      )}

      <SectionFootnote>
        Events from checked calendars are shown as busy blocks and are never
        moved or edited by Ampora.
      </SectionFootnote>

      <View className="mt-4 flex-row items-center justify-between px-1">
        <Text className="text-caption text-neutral-500">
          {formatSyncedAt(externalEventsSyncedAt)}
        </Text>
        <View className="flex-row items-center">
          {calendarSyncCalendarIds.length > 0 && (
            <PressableScale
              onPress={syncNow}
              haptic="selection"
              className="mr-2 min-h-11 justify-center px-2"
              accessibilityRole="button"
              accessibilityLabel="Sync calendars now"
            >
              <Text className="text-label font-medium text-primary-600">Sync now</Text>
            </PressableScale>
          )}
          <PressableScale
            onPress={disconnect}
            haptic="light"
            className="min-h-11 justify-center px-2"
            accessibilityRole="button"
            accessibilityLabel="Disconnect all calendars"
            accessibilityHint="Stops syncing every calendar; you can reconnect any time"
          >
            <Text className="text-label font-medium text-neutral-500">Disconnect</Text>
          </PressableScale>
        </View>
      </View>
    </View>
  )
}
