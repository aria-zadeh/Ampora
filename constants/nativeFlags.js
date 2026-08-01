/**
 * nativeFlags.js — the single source of truth for "is the native (iOS-only)
 * code path enabled for this build".
 *
 * WHY PLAIN COMMONJS JAVASCRIPT AND NOT TYPESCRIPT:
 * this module is required from Node-side config files that are never compiled
 * by Metro or by `tsc`'s app program — `metro.config.js` (CJS, excluded from
 * tsconfig) and `scripts/native-toggle.js`. It is *also* imported from
 * `app.config.ts`, which is TypeScript; that works because `expo/tsconfig.base`
 * sets `allowJs: true`, so `tsc` infers this file's types from the
 * `module.exports` object literal below. Keep it CommonJS.
 *
 * ⚠️  NEVER import this from application code (`app/**`, `components/**`,
 * `store/**`, `core/**`). It reads the filesystem at require time, which is
 * fine in a Node config context and impossible in a Metro bundle. The value the
 * *client bundle* sees is `constants/featureFlags.ts` →
 * `FEATURE_FLAGS.IGNITION_NATIVE`, which reads the Metro-inlined
 * `process.env.EXPO_PUBLIC_AMPORA_NATIVE` that `app.config.ts` sets from here.
 *
 * Resolution order (first hit wins):
 *   1. `AMPORA_NATIVE=1` in the environment  → everything on.
 *      This is how the `-native` EAS profiles build native WITHOUT anyone
 *      committing a flipped flag file, which is exactly what keeps the Windows
 *      quality gate (`tsc` 0 errors + a clean web export) working forever.
 *   2. `native.config.json` at the repo root → per-flag booleans.
 *      Written ONLY by `scripts/native-toggle.js`.
 *   3. Nothing readable → everything off. A missing or malformed flag file must
 *      never fail a build; the fail-safe direction is "native off" (NFR-7).
 */

const fs = require('node:fs')
const path = require('node:path')

/** Repo root, one level up from `constants/`. */
const ROOT = path.resolve(__dirname, '..')

/** The only file `scripts/native-toggle.js` ever writes. */
const FLAG_FILE = path.join(ROOT, 'native.config.json')

/**
 * `AMPORA_NATIVE=1` forces every native flag on for this process only. Anything
 * else (unset, "0", "false", "") leaves the file in charge.
 */
const ENV_OVERRIDE = process.env.AMPORA_NATIVE === '1'

/**
 * Read `native.config.json`. Never throws: a missing/corrupt file resolves to
 * all-false so a broken flag file can only ever under-enable, never break a
 * build or silently enable native code.
 */
function readFlagFile() {
  try {
    const raw = fs.readFileSync(FLAG_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return { ignitionNative: false, purchases: false }
    return {
      ignitionNative: parsed.ignitionNative === true,
      purchases: parsed.purchases === true,
    }
  } catch {
    return { ignitionNative: false, purchases: false }
  }
}

const file = readFlagFile()

/** True when the iOS Family Controls / Ignition native path is enabled. */
const IGNITION_NATIVE = ENV_OVERRIDE || file.ignitionNative

/** True when the RevenueCat native purchase path is enabled. */
const PURCHASES = ENV_OVERRIDE || file.purchases

/** True when ANY native path is on — the switch `app.config.ts` and Metro key off. */
const ANY_NATIVE = IGNITION_NATIVE || PURCHASES

/** Where the resolved value came from, for the toggle script's `status` output. */
const SOURCE = ENV_OVERRIDE ? 'env:AMPORA_NATIVE=1' : 'file:native.config.json'

module.exports = {
  IGNITION_NATIVE,
  PURCHASES,
  ANY_NATIVE,
  SOURCE,
  FLAG_FILE,
  ROOT,
  /** Exposed so the toggle script re-reads the file without duplicating parsing. */
  readFlagFile,
}
