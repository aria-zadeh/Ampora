/**
 * Entitlement helpers — the freemium split (docs/09 decision log, PRD FR-88
 * amendment). Ampora is free to use: tasks, lists, tags, calendar, the
 * auto-scheduler, and a manual lock-free focus timer never require a
 * subscription. Exactly two things do:
 *   - the app-lock (any stake, any hold/trigger)
 *   - AI breakdown / Refine / simplify calls
 *
 * Both predicates below are built directly on `isActive` from
 * `core/subscription.ts`. This file does not duplicate the trial/active/
 * lapsed logic, it only names the two paid surfaces so a call site reads
 * intent ("can this user use the lock right now") rather than re-deriving it
 * from raw subscription state each time.
 *
 * Pure, no I/O. NOT wired into any lock or AI call site yet, that is a
 * separate change. This module only exports the predicates and their tests.
 */

import type { Settings } from '@/types'
import { isActive } from '@/core/subscription'

type Subscription = Settings['subscription']

/**
 * Whether the app-lock may be armed right now (any stake, any hold/trigger).
 * Paid only, an active plan or a live trial. A lapsed trial/subscription
 * still leaves the rest of the app usable, it just cannot start a lock.
 */
export function canUseLock(subscription: Subscription, now: number = Date.now()): boolean {
  return isActive(subscription, now)
}

/**
 * Whether AI breakdown / Refine / simplify calls are allowed right now.
 * Paid only, an active plan or a live trial. A lapsed trial/subscription
 * still leaves the rest of the app usable, it just falls back to the
 * on-device breakdown path instead of calling the AI edge functions.
 */
export function canUseAI(subscription: Subscription, now: number = Date.now()): boolean {
  return isActive(subscription, now)
}

// ---------------------------------------------------------------------------
// Age gate (13+) — onboarding (PRD FR-87 amendment, App Store Guideline 1.3,
// COPPA). Colocated in this file rather than a new one because it is a small
// pure predicate with no I/O, the same shape as the two above, and because
// `vitest.config.ts` only scans `core/**/__tests__/**` for tests, so this is
// where its coverage can actually run.
// ---------------------------------------------------------------------------

/** Minimum age, in years, to use Ampora. */
export const MIN_AGE_YEARS = 13

/**
 * Whether a birth date makes someone at least `MIN_AGE_YEARS` old as of
 * `now`. Calendar-accurate, it checks whether the birthday has actually
 * occurred yet this year rather than a crude year subtraction, so someone
 * born 13 years ago tomorrow is still 12 today.
 *
 * The caller must never persist `birthDateMs` itself, only this function's
 * boolean result belongs in `Settings.ageVerified13Plus`
 * (`app/onboarding/age-gate.tsx`).
 */
export function isAtLeast13(birthDateMs: number, now: number = Date.now()): boolean {
  const birth = new Date(birthDateMs)
  const today = new Date(now)

  let age = today.getFullYear() - birth.getFullYear()
  const monthDiff = today.getMonth() - birth.getMonth()
  const dayDiff = today.getDate() - birth.getDate()
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
    age -= 1
  }

  return age >= MIN_AGE_YEARS
}
