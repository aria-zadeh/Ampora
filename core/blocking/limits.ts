/**
 * Ignition wellbeing limits — the single source of truth for every cap, bound
 * and default the safety layer enforces (PRD §9.10, FR-41, FR-44, FR-46;
 * doc `05` §4 "Wellbeing caps enforcement (shared logic)").
 *
 * These are CODE CONSTANTS, not user data. That distinction is the point:
 * `Settings` holds the values the user may move (their daily cap, their
 * strength, their preferred session length); this file holds the rails those
 * values are clamped to, so a malformed or hostile persisted blob can never
 * widen a wellbeing bound. `stakeStrengthBounds` used to live in `Settings`
 * and is now `STAKE_STRENGTH_BOUNDS` here for exactly that reason.
 *
 * Pure TS: no react-native, no MMKV, no store imports. Safe to import from the
 * stores, the migrations, the sync row mappers and (later) the edge functions.
 */

/** A closed numeric range, `min` and `max` inclusive. */
export interface Bounds {
  min: number
  max: number
}

// ---------------------------------------------------------------------------
// Session length + caps
// ---------------------------------------------------------------------------

/** Allowed focus-session length in minutes (FR-41: "default 45, tunable 15 to 50"). */
export const SESSION_MIN_BOUNDS: Bounds = { min: 15, max: 50 }

/** Default focus-session length for a new stake, in minutes (FR-41). */
export const DEFAULT_SESSION_MIN = 45

/**
 * Hard ceiling on ONE session's lock minutes (§9.10). Also the cap that
 * converts a `hold: 'until_done'` lock into a normal session release, so a bad
 * estimate can never produce a marathon lock (doc `04` §7).
 */
export const DEFAULT_SINGLE_SESSION_CAP_MIN = 50

/** Allowed range for the user-set single-session cap. */
export const SINGLE_SESSION_CAP_BOUNDS: Bounds = { min: 15, max: 50 }

/** Hard ceiling on total lock minutes per day (FR-46). */
export const DEFAULT_DAILY_LOCK_CAP_MIN = 180

/**
 * Allowed range for the user-set daily cap. The ceiling is the shipped default:
 * the cap is "user-lowerable" (FR-46), never user-raisable.
 */
export const DAILY_LOCK_CAP_BOUNDS: Bounds = { min: 15, max: DEFAULT_DAILY_LOCK_CAP_MIN }

// ---------------------------------------------------------------------------
// Strength (FR-44 — a fixed sensible default plus ONE user control, never
// automatically calibrated upward)
// ---------------------------------------------------------------------------

/** Allowed stake strength range. A code constant, deliberately not user data. */
export const STAKE_STRENGTH_BOUNDS: Bounds = { min: 0, max: 1 }

/** Starting stake strength for a fresh, non-struggling user. */
export const DEFAULT_STAKE_STRENGTH = 0.6

// ---------------------------------------------------------------------------
// Never-lock (FR-40, §9.10, doc `05` §4)
// ---------------------------------------------------------------------------

/**
 * The six categories that can never be put on the line: they must stay
 * reachable at all times. Enforced in code (the picker filters on them and
 * `stakesStore.setSelection` rejects them), not only in copy.
 */
export const NEVER_LOCK_CATEGORIES: readonly string[] = [
  'phone',
  'messages',
  'maps',
  'accessibility',
  'os_settings',
  'ampora',
]

/**
 * Category tokens that mean "everything on this device". Selecting one would
 * sweep the never-lock categories in behind it, so doc `05` §4 requires we
 * REFUSE the selection and ask for specific leisure apps instead. On iOS the
 * selection is opaque, so this is matched on the coarse category identifiers a
 * picker can hand back, plus the obvious literals.
 */
export const ALL_APPS_CATEGORY_TOKENS: readonly string[] = [
  'all',
  'all_apps',
  'allapps',
  'everything',
  'com.apple.category.all',
]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clamp `n` into `bounds`. Guards a NaN/undefined input (falls back to
 * `fallback`, itself clamped) and an inverted range, so a malformed persisted
 * value can never escape the rails.
 */
export function clampTo(n: unknown, bounds: Bounds, fallback: number): number {
  const lo = Math.min(bounds.min, bounds.max)
  const hi = Math.max(bounds.min, bounds.max)
  const raw = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(hi, Math.max(lo, raw))
}

/**
 * Whether a leisure-app category is lockable, i.e. NOT on the never-lock list.
 * Case- and whitespace-insensitive. A missing/empty category reads as lockable
 * (the caller supplies a real leisure category).
 */
export function isNeverLockCategory(category: string | undefined, neverLock: readonly string[]): boolean {
  if (!category) return false
  const needle = category.trim().toLowerCase()
  if (!needle) return false
  return neverLock.some((c) => c.trim().toLowerCase() === needle)
}

/** Whether a category token means "all apps" and must therefore be refused (doc `05` §4). */
export function isAllAppsCategory(token: string | undefined): boolean {
  if (!token) return false
  const needle = token.trim().toLowerCase()
  return ALL_APPS_CATEGORY_TOKENS.some((t) => t === needle)
}
