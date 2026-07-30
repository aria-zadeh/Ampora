/**
 * plugin/index.js
 * Ampora Ignition — Expo config plugin entry point (docs/05 §2).
 *
 * Wired from app.config.ts:
 *   plugins: [...(base.plugins ?? []), './native/modules/ampora-ignition/plugin']
 * — reached ONLY on the native path. app.config.ts returns `app.json`
 * completely unchanged, by identity, whenever `native.config.json` is
 * all-false — the PERMANENT state of every shared branch (native/README.md)
 * — so this file never runs on Windows and never affects a web export.
 *
 * Composes three things onto the resolved config:
 *   1. Family Controls + DeviceActivity + ManagedSettings + App Group
 *      entitlements on the MAIN app target.
 *   2. A marker in the main Info.plist so the app can sanity-check its own
 *      App Group id at runtme against `AppGroupStore.appGroupId`.
 *   3. The three app-extension targets themselves, registered directly
 *      against the .xcodeproj (withExtensionTargets.js — the part Expo's
 *      public config-plugin API has no first-class helper for).
 *
 * Target names / bundle IDs / entitlements are NOT redeclared here or in
 * withExtensionTargets.js — both read them straight off
 * `config.extra.eas.build.experimental.ios.appExtensions` and
 * `config.extra.amporaAppGroup`, which app.config.ts already publishes onto
 * the resolved config before any plugin runs. One source of truth: this
 * plugin cannot drift against app.config.ts because it never re-states what
 * app.config.ts already decided.
 */
const { withEntitlementsPlist, withInfoPlist, createRunOncePlugin } = require('@expo/config-plugins')
const { withAmporaExtensionTargets } = require('./withExtensionTargets')

const DEFAULT_APP_GROUP = 'group.com.ampora.blocker'
const DEFAULT_ENTITLEMENTS = {
  'com.apple.developer.family-controls': true,
  'com.apple.developer.deviceactivity': true,
  'com.apple.developer.managedsettings': true,
  'com.apple.security.application-groups': [DEFAULT_APP_GROUP],
}

/** Adds the Family Controls + App Group entitlements to the MAIN app target. */
function withAmporaIgnitionEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    const appExtensions = cfg.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []
    // All four App IDs need the IDENTICAL entitlement set (docs/05 §2); reuse
    // whichever one app.config.ts already built for the extensions (they are
    // all the same object) rather than re-deriving it, so there is exactly
    // one source of truth. The hardcoded fallback only matters if this ever
    // runs with `extra.eas...appExtensions` unexpectedly empty (should not
    // happen once app.config.ts has run, but the main app entitlements are
    // too important to silently end up empty).
    const entitlements = appExtensions[0]?.entitlements ?? DEFAULT_ENTITLEMENTS
    cfg.modResults = { ...cfg.modResults, ...entitlements }
    return cfg
  })
}

/** Marks the App Group in the main Info.plist so the app can sanity-check it matches `AppGroupStore.appGroupId` at runtime. */
function withAmporaAppGroupInfoPlist(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.AmporaAppGroup = cfg.extra?.amporaAppGroup ?? DEFAULT_APP_GROUP
    return cfg
  })
}

function withAmporaIgnition(config) {
  config = withAmporaIgnitionEntitlements(config)
  config = withAmporaAppGroupInfoPlist(config)
  config = withAmporaExtensionTargets(config)
  return config
}

module.exports = createRunOncePlugin(withAmporaIgnition, 'ampora-ignition', '1.0.0')
