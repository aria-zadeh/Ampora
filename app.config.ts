/**
 * app.config.ts — the native-aware wrapper around the static `app.json`.
 *
 * ============================ THE ONE RULE ============================
 * When every flag in `native.config.json` is false (the permanent state of
 * every shared branch, and always the case on Windows), this file returns the
 * `app.json` config **completely untouched**. Not "equivalent", not "mostly the
 * same" — the exact same object, returned by identity. That is what guarantees
 * `npx expo export --platform web` keeps behaving exactly as it did before this
 * file existed. Any change you make here must preserve that property.
 * ======================================================================
 *
 * With the Ignition native path on, it adds the three things that only make
 * sense in a real iOS build and that would break a Windows/web build if they
 * were committed into `app.json` (ARCH_PLAN B0 failure mode 3):
 *
 *   1. `ios.bundleIdentifier` — `app.json` deliberately has none today. A
 *      bundle ID is required before any native build, and setting it only on
 *      the native path keeps the Windows/web config byte-identical to today.
 *   2. `ios.entitlements` — Family Controls, DeviceActivity, ManagedSettings
 *      and the shared App Group on the MAIN app target (doc 05 §2).
 *   3. `plugins += ampora-ignition` and
 *      `extra.eas.build.experimental.ios.appExtensions` for the three
 *      extension targets. FOUR App IDs total (app + 3 extensions), every one of
 *      them carrying Family Controls + App Groups, or provisioning fails with
 *      cryptic errors (doc 05 §2).
 *
 * It also re-publishes the flags into `process.env.EXPO_PUBLIC_*` so the CLIENT
 * bundle can see them: `constants/featureFlags.ts` reads
 * `process.env.EXPO_PUBLIC_AMPORA_NATIVE`, which `babel-preset-expo` inlines at
 * transform time. The `-native` EAS profiles set the same variables directly in
 * `eas.json`, so the client flag is correct even if config evaluation and
 * bundling ever stop sharing a process.
 */

import type { ConfigContext, ExpoConfig } from 'expo/config'
import NATIVE from './constants/nativeFlags'

/** Shared App Group container. The app and all three extensions read/write it (doc 05 §2). */
const APP_GROUP = 'group.com.ampora.blocker'

/** Main app bundle ID. The three extension IDs are derived from it. */
const BUNDLE_ID = 'com.ampora.app'

/**
 * The entitlement set every one of the four App IDs needs. Missing any of these
 * on any target is the single most common cause of "cryptic provisioning
 * errors" for Family Controls apps (doc 05 §2).
 */
const FAMILY_CONTROLS_ENTITLEMENTS = {
  'com.apple.developer.family-controls': true,
  'com.apple.developer.deviceactivity': true,
  'com.apple.developer.managedsettings': true,
  'com.apple.security.application-groups': [APP_GROUP],
}

/**
 * The three iOS app-extension targets. `targetName` must match the folder and
 * target name the config plugin creates in `native/modules/ampora-ignition/
 * plugin/`, or EAS will look for credentials for a target that does not exist.
 */
const APP_EXTENSIONS = [
  {
    targetName: 'AmporaDeviceActivityMonitor',
    bundleIdentifier: `${BUNDLE_ID}.AmporaDeviceActivityMonitor`,
    entitlements: FAMILY_CONTROLS_ENTITLEMENTS,
  },
  {
    targetName: 'AmporaShieldConfiguration',
    bundleIdentifier: `${BUNDLE_ID}.AmporaShieldConfiguration`,
    entitlements: FAMILY_CONTROLS_ENTITLEMENTS,
  },
  {
    targetName: 'AmporaShieldAction',
    bundleIdentifier: `${BUNDLE_ID}.AmporaShieldAction`,
    entitlements: FAMILY_CONTROLS_ENTITLEMENTS,
  },
]

export default ({ config }: ConfigContext): ExpoConfig => {
  // Publish the flags to the client bundle. Done unconditionally (writing "0"
  // when off) so a stale inherited value can never leak a native-on client flag
  // into an off build.
  process.env.EXPO_PUBLIC_AMPORA_NATIVE = NATIVE.IGNITION_NATIVE ? '1' : '0'
  process.env.EXPO_PUBLIC_AMPORA_PURCHASES = NATIVE.PURCHASES ? '1' : '0'

  // THE ONE RULE: native off ⇒ `app.json`, unchanged, by identity.
  if (!NATIVE.ANY_NATIVE) return config as ExpoConfig

  // ---- Native path only from here down. Never runs on Windows or for web. ----

  if (!NATIVE.IGNITION_NATIVE) {
    // Purchases-only native build: RevenueCat autolinks and needs no config
    // changes, so the app config is still `app.json` verbatim.
    return config as ExpoConfig
  }

  const base = config as ExpoConfig

  return {
    ...base,
    ios: {
      ...base.ios,
      bundleIdentifier: BUNDLE_ID,
      entitlements: {
        ...base.ios?.entitlements,
        ...FAMILY_CONTROLS_ENTITLEMENTS,
      },
    },
    plugins: [...(base.plugins ?? []), './native/modules/ampora-ignition/plugin'],
    extra: {
      ...base.extra,
      amporaAppGroup: APP_GROUP,
      eas: {
        ...(base.extra?.eas as Record<string, unknown> | undefined),
        build: {
          experimental: {
            ios: {
              appExtensions: APP_EXTENSIONS,
            },
          },
        },
      },
    },
  }
}
