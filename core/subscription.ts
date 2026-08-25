/**
 * Subscription helpers — Phase 7 (PRD FR-88: a 2-week free trial, then
 * monthly/annual plans, billed through Apple IAP). Ampora itself is free to
 * use, see `core/entitlements.ts` for the freemium split. `isActive` below
 * is entitlement to the two paid surfaces (the app-lock, AI calls), not
 * access to the app as a whole any more.
 *
 * Pure functions over `Settings['subscription']`. No I/O, no store, no IAP
 * library — real purchasing (StoreKit / react-native-iap) is a documented later
 * step; these compute trial/entitlement state for the paywall and any gating.
 * Keeping them pure means the portable engine and tests can use them too.
 *
 * `subscription.status` is one of 'trial' | 'active' | 'lapsed' (types/index.ts):
 * - 'active' — a paid plan is current (entitled regardless of the trial clock).
 * - 'trial'  — inside the free trial; entitled until `trialEndsAt` passes.
 * - 'lapsed' — expired/cancelled; not entitled.
 */

import type { Settings } from '@/types'

type Subscription = Settings['subscription']

/** Length of the free trial in days (PRD FR-88: "2-week trial"). */
export const TRIAL_DURATION_DAYS = 14

const MS_PER_DAY = 24 * 60 * 60 * 1000

/**
 * Whole days remaining in the trial, rounded UP so a partial final day still
 * counts as a day left (a user with 3h left "has 1 day left", not 0). Returns 0
 * when there is no trial window, it has passed, or the subscription is not in
 * the trial state. Never negative.
 */
export function trialDaysLeft(subscription: Subscription, now: number = Date.now()): number {
  if (subscription.status !== 'trial') return 0
  const endsAt = subscription.trialEndsAt
  if (endsAt == null) return 0
  const msLeft = endsAt - now
  if (msLeft <= 0) return 0
  return Math.ceil(msLeft / MS_PER_DAY)
}

/**
 * Whether the user is currently entitled (paywall should be OPEN, i.e. content
 * unlocked):
 * - 'active' → always entitled.
 * - 'trial'  → entitled while `now` is before `trialEndsAt` (a missing
 *   `trialEndsAt` is treated as expired, so the paywall shows rather than
 *   granting indefinite free access).
 * - 'lapsed' → never entitled.
 */
export function isActive(subscription: Subscription, now: number = Date.now()): boolean {
  if (subscription.status === 'active') return true
  if (subscription.status === 'trial') {
    return subscription.trialEndsAt != null && now < subscription.trialEndsAt
  }
  return false
}

/**
 * Begin a fresh 14-day trial: returns a `subscription` in the 'trial' state with
 * `trialEndsAt` = `now` + 14 days. Plan is left unset (chosen at purchase).
 * Pure — the caller persists this via `useSettingsStore.updateSettings`.
 */
export function startTrial(now: number = Date.now()): Subscription {
  return {
    status: 'trial',
    trialEndsAt: now + TRIAL_DURATION_DAYS * MS_PER_DAY,
  }
}

/**
 * Whether the paywall (`app/paywall.tsx`) may be dismissed — header close,
 * swipe gesture, or the Android hardware back button.
 *
 * Always true. The freemium split (`core/entitlements.ts`) means the app is
 * free to use, and only the app-lock and AI calls require entitlement, so
 * the paywall is no longer an access gate for the rest of the app. A lapsed
 * trial or subscription now lands the user back in the app, not on a wall
 * (`app/_layout.tsx`'s routing gate no longer redirects to `/paywall` at
 * all), so nothing needs this screen to be undismissable any more.
 *
 * Kept as its own exported function, rather than inlining `true` at every
 * call site, so `app/paywall.tsx` still reads its dismiss-affordance logic
 * from one named place, and so a future change to this rule stays
 * independently unit-tested (`core/__tests__/subscription.test.ts`) rather
 * than only verified by reading the screen's JSX. Parameters are unused on
 * purpose, kept for a stable call-site signature.
 */
export function isPaywallDismissible(_subscription: Subscription, _now: number = Date.now()): boolean {
  return true
}
