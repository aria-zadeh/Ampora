/**
 * Dev-only sign-in bypass.
 *
 * Ampora requires a real account and has no anonymous mode (FR-87). Every read
 * here is gated on `FEATURE_FLAGS.DEV_BYPASS_AUTH`, so a persisted `true` is
 * inert wherever that flag is false.
 *
 * **That flag is no longer just `__DEV__`.** Since 2026-08-07 it is also true
 * when `EXPO_PUBLIC_DEV_AUTH_BYPASS === '1'`, which `vercel.json` sets for the
 * deployed web preview at Aria's explicit request. So this store CAN be live in
 * a production build. Read `constants/featureFlags.ts` for the full reasoning
 * and, more importantly, for what has to be removed before the site is public
 * or anything is submitted to a store.
 *
 * What it exists for: Google sign-in and the email magic link both depend on
 * remote configuration that is not finished yet (`setup/02-supabase.md`), so
 * without this there is no way to open the app at all on a dev machine. That is
 * a bad reason to be blocked from working on the other 95% of the product.
 *
 * What bypassing does NOT do: it does not fabricate a Supabase session. There
 * is no user id, no JWT, and nothing to sync with. `app/_layout.tsx`'s sync
 * effect is already gated on a real `authUser`, so in bypass mode cloud sync
 * simply never runs and the app behaves as pure local-first over MMKV. Every
 * cloud call in `services/supabase.ts` independently no-ops without a signed-in
 * user anyway, so nothing can be written to the wrong account.
 */

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { mmkvStateStorage } from './mmkv'

interface DevAuthState {
  /**
   * Raw persisted value. Prefer the `useDevAuthBypassed()` hook or
   * `isDevAuthBypassed()` — both apply the production kill switch. Reading this
   * field directly skips that check, which is exactly the bug this comment
   * exists to prevent.
   */
  bypassedRaw: boolean
  enableBypass: () => void
  disableBypass: () => void
}

export const useDevAuthStore = create<DevAuthState>()(
  persist(
    (set) => ({
      bypassedRaw: false,
      enableBypass: () => set({ bypassedRaw: true }),
      disableBypass: () => set({ bypassedRaw: false }),
    }),
    {
      name: 'ampora-dev-auth',
      storage: createJSONStorage(() => mmkvStateStorage),
    }
  )
)

/**
 * Reactive read for components. False in production regardless of storage.
 * Raw-selects one field, so it is safe under the Zustand v5 selector rules in
 * CLAUDE.md without `useShallow`.
 */
export function useDevAuthBypassed(): boolean {
  const raw = useDevAuthStore((s) => s.bypassedRaw)
  return FEATURE_FLAGS.DEV_BYPASS_AUTH && raw
}

/** Non-reactive read, for effects and plain functions. */
export function isDevAuthBypassed(): boolean {
  return FEATURE_FLAGS.DEV_BYPASS_AUTH && useDevAuthStore.getState().bypassedRaw
}
