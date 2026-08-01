/**
 * nativeModule.ts — resolves the optional native Ignition module by NAME
 * (ARCH_PLAN B6), so Metro has nothing to statically resolve and `tsc` on
 * Windows never needs `native/**` to exist.
 *
 * `requireOptionalNativeModule` comes from `expo-modules-core`, already a
 * transitive dependency of `expo` regardless of the native flag, so this
 * import is always resolvable — the thing that's OPTIONAL is whether the
 * module NAMED `'AmporaIgnition'` is actually linked, not whether this
 * package exists. On web, `expo-modules-core` ships a `.web` variant of
 * `requireOptionalNativeModule` that always returns null, so this file needs
 * no platform branching of its own.
 *
 * This is a deliberate parallel to (never an import of)
 * `native/modules/ampora-ignition/src/index.ts`, which does the exact same
 * resolution for that package's own consumers. The two stay independent so
 * this file — and everything that imports it, including `./index.ts` and
 * `./NativeBlockingStrategy.ts` — never has a module-graph edge into
 * `native/**`.
 */
import { requireOptionalNativeModule } from 'expo-modules-core'

import type { IgnitionNativeModule } from './nativeTypes'

let cached: IgnitionNativeModule | null | undefined

/**
 * Resolve the native Ignition module, or `null` when it is not present
 * (wrong platform, native flag off, or a build without the module linked).
 * Memoized — the module identity cannot change within a running process.
 *
 * Never throws (NFR-7): any resolution failure degrades to `null`, treated
 * identically to "not installed" by every caller.
 */
export function resolveIgnitionNativeModule(): IgnitionNativeModule | null {
  if (cached !== undefined) return cached
  try {
    cached = requireOptionalNativeModule<IgnitionNativeModule>('AmporaIgnition')
  } catch (err) {
    console.warn('resolveIgnitionNativeModule: requireOptionalNativeModule threw, falling back to null:', err)
    cached = null
  }
  return cached
}

/**
 * Test-only escape hatch: clears the memoized module so a test can simulate
 * re-resolution (e.g. after mocking `expo-modules-core`). Not used by app code.
 */
export function __resetIgnitionNativeModuleCacheForTests(): void {
  cached = undefined
}
