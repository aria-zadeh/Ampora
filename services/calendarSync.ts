/**
 * Calendar sync service — FR-22, read-only.
 *
 * Ampora does not run its own OAuth against Google/Outlook/iCloud. Instead it
 * reads the calendars already synced onto the device: once a user has signed
 * into a Google, Outlook, or iCloud account at the OS level, that account's
 * calendars land in the same on-device calendar database (EventKit on iOS,
 * CalendarContract on Android). Reading that one database gets all three
 * providers with a single permission prompt and zero OAuth client IDs, token
 * storage, or refresh logic of our own.
 *
 * READ-ONLY, ALWAYS: this module never creates, updates, or deletes a device
 * calendar or event. FR-22 puts write-back explicitly out of scope for
 * launch. Every exported function is also safe to call on web — expo-calendar
 * has no web implementation, so calls there degrade to an empty/unsupported
 * result instead of throwing — and never throws for a denied/undetermined
 * permission either (FR-64: a permission gap degrades gracefully, it never
 * blocks the rest of the app).
 */

import { Platform } from 'react-native'
import * as Calendar from 'expo-calendar'
import type { CalEvent } from '@/types'
import { stableId } from '@/core/id'

/**
 * `expo-calendar` ships a web shim (permission calls resolve to "not
 * granted"; there is no web `getCalendarsAsync`/`getEventsAsync` at all), so
 * the import above is safe on every platform — matches the static-import +
 * `Platform.OS` guard convention already used in `services/notifications.ts`.
 * Every entry point below still explicitly skips web so it never calls a
 * method the web shim doesn't implement.
 */
const isSupported = Platform.OS !== 'web'

export type CalendarPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported'

/** A device calendar the user can choose to sync (one row in the settings picker). */
export interface DeviceCalendar {
  id: string
  title: string
  /** Human-readable account/source name, e.g. "aria@gmail.com" or "iCloud". */
  sourceName: string
  /** The calendar's display color, as given by the OS. */
  color: string
}

// ---------------------------------------------------------------------------
// Permission
// ---------------------------------------------------------------------------

/** Current calendar read-permission status. Never throws. */
export async function getPermissionStatus(): Promise<CalendarPermissionStatus> {
  if (!isSupported) return 'unsupported'
  try {
    const { status } = await Calendar.getCalendarPermissionsAsync()
    return status as CalendarPermissionStatus
  } catch (err) {
    console.warn('[calendarSync] getPermissionStatus failed:', err)
    return 'unsupported'
  }
}

/**
 * Request calendar read permission (triggers the OS prompt if undetermined).
 * Returns the resulting status. Never throws — a denial or an unsupported
 * platform both resolve normally rather than rejecting.
 */
export async function requestPermission(): Promise<CalendarPermissionStatus> {
  if (!isSupported) return 'unsupported'
  try {
    const { status } = await Calendar.requestCalendarPermissionsAsync()
    return status as CalendarPermissionStatus
  } catch (err) {
    console.warn('[calendarSync] requestPermission failed:', err)
    return 'unsupported'
  }
}

// ---------------------------------------------------------------------------
// Calendar listing
// ---------------------------------------------------------------------------

/**
 * The device's event calendars (Google/Outlook/iCloud accounts all surface
 * here once synced at the OS level — a "Classes" calendar, a personal Gmail
 * calendar, a shared family calendar, etc, each as its own row). Returns []
 * on web, when unsupported, or on any error / missing permission — never
 * throws. Deliberately does NOT auto-select anything: reading every calendar
 * by default is wrong (a birthdays or holidays calendar would block the
 * entire schedule), so the caller always starts from an explicit empty
 * selection and the user opts each one in.
 */
export async function listCalendars(): Promise<DeviceCalendar[]> {
  if (!isSupported) return []
  try {
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    return calendars.map((c) => ({
      id: c.id,
      title: c.title || 'Untitled calendar',
      sourceName: c.source?.name || c.ownerAccount || 'This device',
      color: c.color || '#8B8378',
    }))
  } catch (err) {
    console.warn('[calendarSync] listCalendars failed:', err)
    return []
  }
}

// ---------------------------------------------------------------------------
// Events -> CalEvent
// ---------------------------------------------------------------------------

/**
 * Best-effort mapping from a device calendar's account source to
 * `CalEvent.source`. The device calendar DB does not label rows "this is a
 * Google calendar" in a structured, cross-platform way — it exposes an
 * account/source name and (on iOS) a source type string, both free text set
 * by the OS/provider — so this is a heuristic over that text. Falls back to
 * 'local' whenever the provider can't be determined, which is always a safe
 * default: `source` is informational (used for provider iconography), never
 * load-bearing for scheduling — `busy` is what the engine actually reads.
 */
function guessSource(sourceName: string | undefined, sourceType: string | undefined): CalEvent['source'] {
  const hay = `${sourceName ?? ''} ${sourceType ?? ''}`.toLowerCase()
  if (hay.includes('google')) return 'google'
  if (hay.includes('outlook') || hay.includes('office365') || hay.includes('exchange')) return 'outlook'
  if (hay.includes('icloud') || hay.includes('apple')) return 'apple'
  return 'local'
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(value as string)
}

/**
 * Maps one `expo-calendar` Event onto Ampora's `CalEvent` shape.
 *
 * All-day events: `expo-calendar` already normalizes `startDate`/`endDate` to
 * the correct absolute instants for an all-day span (midnight-to-midnight),
 * so no special-casing is needed beyond carrying `allDay` through — the plain
 * epoch-ms conversion below is already correct.
 *
 * Midnight-crossing events: likewise handled by just passing the real
 * start/end span through untouched. `core/scheduler/freeTime.ts` subtracts
 * busy spans directly (`busyEventSpans` -> `subtractSpans`), which already
 * handles a span that crosses a day boundary correctly — Ampora's engine has
 * no per-day event model to split against, so there is nothing to split here.
 *
 * `id` is derived deterministically from (calendarId, device event id, start
 * time) rather than just the device event id: on iOS, EventKit gives every
 * occurrence of a RECURRING event the SAME `eventIdentifier` — only start/end
 * differ per instance. Keying purely on the device id would collapse a whole
 * semester of "Physics 101, Mon/Wed/Fri" into a single occurrence and silently
 * stop blocking the others. Folding the start time into the id keeps every
 * occurrence distinct while staying deterministic across repeated fetches
 * (same occurrence -> same `id` -> a refresh replaces it, never duplicates
 * it). `externalId` still carries the raw provider event id as documented,
 * even though it can repeat across a recurring series — that's the honest
 * value the OS actually gives us.
 */
function toCalEvent(event: Calendar.Event, source: CalEvent['source'], now: number): CalEvent {
  const start = toDate(event.startDate).getTime()
  const end = toDate(event.endDate).getTime()
  return {
    id: stableId('calendarSync', event.calendarId, event.id, String(start)),
    createdAt: now,
    updatedAt: now,
    syncState: 'synced',
    title: event.title?.trim() || 'Busy',
    start,
    end,
    allDay: !!event.allDay,
    source,
    externalId: event.id,
    busy: true,
  }
}

/**
 * Reads events from the given device calendars over `[rangeStart, rangeEnd)`
 * and maps them onto `CalEvent[]`, all flagged `busy: true` (these are the
 * calendars the user opted into as "count this as busy time" — see
 * `listCalendars`). Returns [] on web, when unsupported, when `calendarIds`
 * is empty, or on any error / missing permission — never throws, so callers
 * can call this unconditionally without their own try/catch.
 */
export async function fetchBusyEvents(
  calendarIds: string[],
  rangeStart: number,
  rangeEnd: number
): Promise<CalEvent[]> {
  if (!isSupported || calendarIds.length === 0 || rangeEnd <= rangeStart) return []
  try {
    // Fetch calendars too, so each event's `source` can be guessed from its
    // owning calendar's account — `getEventsAsync` events don't carry the
    // source themselves, only a `calendarId`.
    const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT)
    const sourceByCalendarId = new Map<string, CalEvent['source']>()
    for (const c of calendars) {
      sourceByCalendarId.set(c.id, guessSource(c.source?.name, c.source?.type as string | undefined))
    }

    const events = await Calendar.getEventsAsync(
      calendarIds,
      new Date(rangeStart),
      new Date(rangeEnd)
    )

    const now = Date.now()
    return events.map((e) => toCalEvent(e, sourceByCalendarId.get(e.calendarId) ?? 'local', now))
  } catch (err) {
    console.warn('[calendarSync] fetchBusyEvents failed:', err)
    return []
  }
}
