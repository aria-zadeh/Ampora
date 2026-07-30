/**
 * index.ts — the JS entry point for the `ampora-ignition` Expo module.
 *
 * Resolves the native module by NAME (`requireOptionalNativeModule`), never by
 * a class import, so this file has nothing Metro needs to statically resolve
 * beyond `expo-modules-core` itself (already a transitive dependency of
 * `expo`, present regardless of the native flag). That is what lets
 * `core/blocking/nativeModule.ts` do the exact same resolution WITHOUT ever
 * importing this package — see that file's header for why the two are
 * deliberately parallel rather than one importing the other.
 */
import { requireOptionalNativeModule } from 'expo-modules-core'

import type { AmporaIgnitionNativeModule } from './types'

export * from './types'
export { FamilyActivityPicker } from './FamilyActivityPicker'
export type { FamilyActivityPickerProps, FamilyActivityPickerResult } from './FamilyActivityPicker'

let cached: AmporaIgnitionNativeModule | null | undefined

/**
 * The resolved native module, or `null` when it is not linked (wrong
 * platform, native build without a real device build, or — on web —
 * `expo-modules-core`'s own `.web` variant of `requireOptionalNativeModule`,
 * which always returns null). Memoized: the module identity cannot change
 * within a running process. Never throws (NFR-7) — any resolution failure
 * degrades to `null`, the same as "not installed".
 */
export function getAmporaIgnitionNativeModule(): AmporaIgnitionNativeModule | null {
  if (cached !== undefined) return cached
  try {
    cached = requireOptionalNativeModule<AmporaIgnitionNativeModule>('AmporaIgnition')
  } catch (err) {
    console.warn('ampora-ignition: requireOptionalNativeModule("AmporaIgnition") threw, treating as absent:', err)
    cached = null
  }
  return cached
}
