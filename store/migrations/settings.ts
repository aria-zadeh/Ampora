/**
 * `ampora-settings` persisted-state migration + validation (v0 -> v1).
 *
 * Three jobs, all of which used to be nobody's:
 *
 * 1. **Shape migration.** `stakeStrengthBounds` is gone (bounds are a code
 *    constant, not user data — `core/blocking/limits.ts`), replaced by the
 *    single user control `stakeStrength` (FR-44). `singleSessionCapMin` and
 *    `defaultSessionMin` are new (§9.10, FR-41).
 *
 * 2. **Clamping every numeric.** `settingsStore.updateSettings` was a raw
 *    spread with no validation at all, so a bad write (or a hand-edited blob)
 *    could put a 10-hour daily cap or a negative session length into the
 *    wellbeing layer. Every numeric now goes through `normalizeSettings`, on
 *    read AND on write. The daily cap's ceiling is the shipped default: FR-46
 *    says the cap is user-LOWERABLE, never user-raisable.
 *
 * 3. **A real deep merge.** Zustand's default `merge` is a shallow spread, so
 *    restoring an older blob would replace the whole `settings` object and drop
 *    every field added since it was written. That shallow behaviour is the root
 *    cause of the `safeSettings()` backfill in `stakesStore.ts`; with
 *    `mergeSettingsState` in place that backfill becomes redundancy rather than
 *    load-bearing, which is the right relationship for a wellbeing guardrail.
 *
 * Pure module: types + `core/blocking/limits` only. No MMKV, no store imports,
 * so it can be unit-tested in isolation.
 */

import {
  DAILY_LOCK_CAP_BOUNDS,
  DEFAULT_DAILY_LOCK_CAP_MIN,
  DEFAULT_SESSION_MIN,
  DEFAULT_SINGLE_SESSION_CAP_MIN,
  DEFAULT_STAKE_STRENGTH,
  NEVER_LOCK_CATEGORIES,
  SESSION_MIN_BOUNDS,
  SINGLE_SESSION_CAP_BOUNDS,
  STAKE_STRENGTH_BOUNDS,
  clampTo,
} from '@/core/blocking/limits'
import type { Settings, TimeWindow } from '@/types'

/** The current persisted schema version for `ampora-settings`. */
export const SETTINGS_PERSIST_VERSION = 1

/** The v0 fields this migration knows how to read but no longer stores. */
interface LegacySettingsFields {
  /** v0: bounds lived in user data. Now `STAKE_STRENGTH_BOUNDS` in code. */
  stakeStrengthBounds?: { min?: number; max?: number }
}

/** What the settings store persists (actions are not serialized). */
export interface PersistedSettingsState {
  settings: Settings
}

/** A minute-of-day window with both bounds finite and inside 0..1439, else `fallback`. */
function safeWindow(w: unknown, fallback: TimeWindow): TimeWindow {
  if (w && typeof w === 'object') {
    const c = w as Partial<TimeWindow>
    const startOk = typeof c.start === 'number' && Number.isFinite(c.start)
    const endOk = typeof c.end === 'number' && Number.isFinite(c.end)
    if (startOk && endOk) {
      // Wrap into 0..1439 rather than rejecting: a window that wraps past
      // midnight is legitimate (the default quiet hours do), only out-of-range
      // raw numbers are not.
      const wrap = (n: number) => ((Math.round(n) % 1440) + 1440) % 1440
      return { start: wrap(c.start as number), end: wrap(c.end as number) }
    }
  }
  return { ...fallback }
}

/**
 * The six never-lock categories, plus anything extra the user added, minus
 * duplicates. The shipped six are UNIONED in unconditionally: a persisted list
 * that lost one of them (a bad write, a partial sync) must not silently make
 * Phone lockable.
 */
function safeNeverLock(raw: unknown): string[] {
  const extra = Array.isArray(raw) ? raw.filter((c): c is string => typeof c === 'string' && c.trim() !== '') : []
  const seen = new Set<string>()
  const out: string[] = []
  for (const c of [...NEVER_LOCK_CATEGORIES, ...extra]) {
    const key = c.trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(c.trim())
  }
  return out
}

/** An optional positive-integer setting: clamped when present, omitted when absent. */
function optionalInt(n: unknown, min: number, max: number): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Math.round(clampTo(n, { min, max }, min))
}

/** The wellbeing fields, always produced and always in-bounds. */
export interface NormalizedWellbeing {
  dailyLockCapMin: number
  singleSessionCapMin: number
  defaultSessionMin: number
  stakeStrength: number
  quietHours: TimeWindow
  neverLockCategories: string[]
  maxNotificationsPerHour: number
}

/**
 * Clamp the wellbeing block of a (possibly partial, possibly malformed)
 * settings object. Always returns every field, so the caller can spread it over
 * a partial and get a well-formed safety layer regardless of what was stored.
 */
export function clampWellbeing(raw: Partial<Settings> & LegacySettingsFields): NormalizedWellbeing {
  const dailyLockCapMin = Math.round(
    clampTo(raw.dailyLockCapMin, DAILY_LOCK_CAP_BOUNDS, DEFAULT_DAILY_LOCK_CAP_MIN)
  )
  const singleSessionCapMin = Math.round(
    clampTo(raw.singleSessionCapMin, SINGLE_SESSION_CAP_BOUNDS, DEFAULT_SINGLE_SESSION_CAP_MIN)
  )
  // A session can never be longer than one session is allowed to be, and never
  // longer than the whole day's budget.
  const sessionCeiling = Math.min(SESSION_MIN_BOUNDS.max, singleSessionCapMin, dailyLockCapMin)
  const defaultSessionMin = Math.round(
    clampTo(
      raw.defaultSessionMin,
      { min: Math.min(SESSION_MIN_BOUNDS.min, sessionCeiling), max: sessionCeiling },
      Math.min(DEFAULT_SESSION_MIN, sessionCeiling)
    )
  )
  return {
    dailyLockCapMin,
    singleSessionCapMin,
    defaultSessionMin,
    stakeStrength: clampTo(raw.stakeStrength, STAKE_STRENGTH_BOUNDS, DEFAULT_STAKE_STRENGTH),
    quietHours: safeWindow(raw.quietHours, { start: 23 * 60, end: 8 * 60 }),
    neverLockCategories: safeNeverLock(raw.neverLockCategories),
    maxNotificationsPerHour: Math.round(clampTo(raw.maxNotificationsPerHour, { min: 0, max: 12 }, 1)),
  }
}

/**
 * Clamp the OPTIONAL scheduling numerics. Keys absent from `raw` stay absent,
 * so this never invents a per-user override the engine would then honour.
 */
export function clampSchedulingNumerics(raw: Partial<Settings>): Partial<Settings> {
  const out: Partial<Settings> = {}
  const bufferBefore = optionalInt(raw.defaultBufferBeforeMin, 0, 120)
  if (bufferBefore !== undefined) out.defaultBufferBeforeMin = bufferBefore
  const bufferAfter = optionalInt(raw.defaultBufferAfterMin, 0, 120)
  if (bufferAfter !== undefined) out.defaultBufferAfterMin = bufferAfter
  const minBlock = optionalInt(raw.defaultMinBlockMin, 5, 480)
  if (minBlock !== undefined) out.defaultMinBlockMin = minBlock
  const maxBlock = optionalInt(raw.defaultMaxBlockMin, minBlock ?? 5, 480)
  if (maxBlock !== undefined) out.defaultMaxBlockMin = maxBlock
  const cutoff = optionalInt(raw.autoScheduleCutoffWeeks, 1, 52)
  if (cutoff !== undefined) out.autoScheduleCutoffWeeks = cutoff
  const zoom = optionalInt(raw.calendarZoomPxPerHour, 20, 240)
  if (zoom !== undefined) out.calendarZoomPxPerHour = zoom
  return out
}

/**
 * Normalize a settings object: drop the retired `stakeStrengthBounds`, clamp
 * every numeric, and guarantee a well-formed wellbeing block. Shape-preserving
 * — a complete `Settings` in gives a complete `Settings` out, a partial gives a
 * partial plus a complete wellbeing block.
 *
 * Used on BOTH read (migration, merge) and write (`updateSettings`), which is
 * the point: a value that cannot be stored cannot be enforced.
 */
export function normalizeSettings<T extends Partial<Settings>>(
  raw: T & LegacySettingsFields
): T & NormalizedWellbeing {
  const out = {
    ...raw,
    ...clampWellbeing(raw),
    ...clampSchedulingNumerics(raw),
  } as T & NormalizedWellbeing & LegacySettingsFields
  // Explicitly strip the retired v0 field so the spread above cannot carry it
  // forward and resurrect it in a later blob.
  delete out.stakeStrengthBounds
  return out
}

/**
 * v0 -> v1 migration for the `ampora-settings` blob.
 *
 * Deliberately total: any shape (null, a string, a half-written object) yields
 * a valid `{ settings }`, because a settings blob that fails to load would take
 * the whole app's wellbeing layer down with it. Missing fields are filled by
 * the store's defaults during `mergeSettingsState`, which runs after this.
 */
export function migrateSettings(persisted: unknown, _version: number): PersistedSettingsState {
  const container = persisted && typeof persisted === 'object' ? (persisted as { settings?: unknown }) : {}
  const raw =
    container.settings && typeof container.settings === 'object'
      ? (container.settings as Partial<Settings> & LegacySettingsFields)
      : {}
  // Sibling keys are spread through untouched. The settings store persists a
  // few plain fields ALONGSIDE `settings` (e.g. the opted-in device calendar
  // ids); this migration only reasons about `settings`, and dropping the rest
  // would quietly reset them on upgrade.
  //
  // The cast is safe because `mergeSettingsState` immediately deep-merges this
  // over the store's complete initial state, filling anything still absent.
  return { ...container, settings: normalizeSettings(raw) as Settings }
}

/**
 * Deep merge for `persist`. Zustand's default merge is a shallow spread, which
 * would replace `settings` wholesale and silently drop every default added
 * since the blob was written. This merges INSIDE `settings` (persisted values
 * win over defaults, defaults fill the gaps) and then re-normalizes, so a
 * restored blob can never reintroduce an out-of-bounds wellbeing value.
 */
export function mergeSettingsState<S extends PersistedSettingsState>(persisted: unknown, current: S): S {
  if (!persisted || typeof persisted !== 'object') return current
  const p = persisted as Partial<S> & { settings?: Partial<Settings> & LegacySettingsFields }
  const merged = { ...current, ...p } as S
  merged.settings = normalizeSettings({ ...current.settings, ...(p.settings ?? {}) }) as Settings
  return merged
}
