/**
 * ampora-ignition.plugin.js
 * Ampora — Ignition Expo config plugin (ISOLATED reference TEMPLATE, NOT active).
 *
 * =========================== DO NOT WIRE IN YET ===========================
 * This template is NOT referenced from app.json/app.config and is excluded
 * from tsconfig (`native/**`). It has ZERO effect on the current RN/web build.
 * It is the scaffolding that, once IGNITION_NATIVE is enabled, adds the iOS
 * Family Controls entitlements, the App Group, and the three app-extension
 * targets (DeviceActivityMonitor, ShieldConfiguration, ShieldAction) needed
 * for real OS app-blocking (docs/06 §2). To use it: copy it out of
 * native/ignition/ into a build-visible path, then add it to `expo.plugins`.
 * ==========================================================================
 *
 * In practice you will likely rely on the config plugin shipped by
 * `react-native-device-activity` or `expo-app-blocker` and only use this as a
 * checklist of what MUST end up in the native project. Kept dependency-light
 * (only the `@expo/config-plugins` helpers, which are dev-time only).
 */

const {
  withEntitlementsPlist,
  withInfoPlist,
  createRunOncePlugin,
} = require('@expo/config-plugins')

const APP_GROUP = 'group.com.ampora.blocker'

// Entitlements every target (main app + 3 extensions) needs (docs/06 §2).
const FAMILY_CONTROLS_ENTITLEMENTS = {
  'com.apple.developer.family-controls': true,
  'com.apple.developer.deviceactivity': true,
  'com.apple.developer.managedsettings': true,
  'com.apple.security.application-groups': [APP_GROUP],
}

/** Adds the Family Controls + App Group entitlements to the MAIN app target. */
function withAmporaIgnitionEntitlements(config) {
  return withEntitlementsPlist(config, (cfg) => {
    cfg.modResults = { ...cfg.modResults, ...FAMILY_CONTROLS_ENTITLEMENTS }
    return cfg
  })
}

/** Marks the app group in Info.plist so the extensions can share state. */
function withAmporaAppGroup(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.AmporaAppGroup = APP_GROUP
    return cfg
  })
}

/**
 * The real plugin also needs to register the THREE app-extension targets and
 * copy in the Swift files from native/ignition/. Expo's public config-plugin
 * API does not create extension targets directly, so in a real setup you
 * either:
 *   (a) use react-native-device-activity / expo-app-blocker, whose plugins
 *       create the extension targets for you, or
 *   (b) add a config-plugin that runs a Podfile/`xcodeproj` mod to add the
 *       DeviceActivityMonitor, ShieldConfiguration, and ShieldAction targets
 *       with FAMILY_CONTROLS_ENTITLEMENTS on each, plus the App Group.
 *
 * Also declare the extensions in app.json under:
 *   extra.eas.build.experimental.ios.appExtensions = [
 *     { targetName, bundleIdentifier, entitlements: FAMILY_CONTROLS_ENTITLEMENTS }, ...
 *   ]
 * Four App IDs total (app + 3 extensions), all with Family Controls + App
 * Groups, or provisioning fails with cryptic errors (docs/06 §2).
 */
function withAmporaIgnition(config) {
  config = withAmporaIgnitionEntitlements(config)
  config = withAmporaAppGroup(config)
  // config = withAmporaExtensionTargets(config)   // (a) or (b) above
  return config
}

module.exports = createRunOncePlugin(
  withAmporaIgnition,
  'ampora-ignition',
  '1.0.0'
)
