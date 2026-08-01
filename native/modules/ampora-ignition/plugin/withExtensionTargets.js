/**
 * withExtensionTargets.js
 * Ampora Ignition — registers the three app-extension targets directly
 * against the Xcode project (docs/05 §2).
 *
 * WHY THIS EXISTS: Expo's public config-plugin API gives you `withXcodeProject`
 * (a "xcodeproj mod" — inside the callback, `config.modResults` IS the parsed
 * pbxproj, an instance of the `xcode` npm package's project class; that
 * package is already a transitive dependency of `@expo/config-plugins`, so
 * nothing extra needs installing) but has NO first-class "add an app
 * extension target" helper. The in-repo `ampora-ignition.plugin.js` this file
 * replaces said as much and stopped short of it ("Expo's public config-plugin
 * API does not create extension targets directly, so in a real setup you
 * either (a) use a package whose plugin does it for you, or (b) run an
 * xcodeproj mod"). This file is that (b).
 *
 * WHAT IT DOES, per extension (source of extensions:
 * `config.extra.eas.build.experimental.ios.appExtensions`, published by
 * app.config.ts — read here, never re-declared, so this file and
 * app.config.ts cannot drift against each other):
 *
 *   1. (withCopiedExtensionFiles, a dangerous 'ios' mod) Copy the extension's
 *      Swift source + Info.plist from
 *      native/modules/ampora-ignition/ios/extensions/<Name>/ into
 *      ios/<TargetName>/, PLUS the shared AppGroupStore.swift (one canonical
 *      source on disk — see native/README.md), PLUS a generated
 *      .entitlements file built from the SAME entitlements object
 *      app.config.ts already computed for this extension.
 *
 *   2. (withRegisteredExtensionTargets, a withXcodeProject mod)
 *      `project.addTarget(targetName, 'app_extension', targetName, bundleId)`
 *      — per `xcode`'s own source (node_modules/xcode/lib/pbxProject.js,
 *      read during this task, not from memory alone), this ALSO creates a
 *      "Copy Files" build phase on the FIRST (main app) target that embeds
 *      the new target's `.appex` product. That means this mod is sufficient
 *      on its own for embedding — there is no separate "embed extensions"
 *      step needed anywhere else in this plugin or in app.config.ts.
 *
 *      Then: a Sources build phase with the copied Swift files, empty
 *      Resources/Frameworks build phases, the frameworks each extension
 *      needs linked, and CODE_SIGN_ENTITLEMENTS / SWIFT_VERSION /
 *      IPHONEOS_DEPLOYMENT_TARGET / TARGETED_DEVICE_FAMILY set SCOPED TO
 *      JUST THIS TARGET via the local `setTargetBuildProperty` helper — NOT
 *      `addBuildProperty`, which (see its source, same file) stamps every
 *      build configuration in the WHOLE PROJECT, which would wrongly give
 *      the main app and the other two extensions this one's entitlements
 *      path. Also NOT `xcode`'s own `updateBuildProperty(..., targetName)`:
 *      confirmed (see `setTargetBuildProperty`'s doc comment) that it is a
 *      silent no-op for a target added earlier in the SAME mod invocation,
 *      because of a name-quoting bug in `pbxTargetByName` — this is the
 *      actual root cause of a real `SWIFT_VERSION '' is unsupported` build
 *      failure hit and fixed during this task.
 *
 * CONFIDENCE NOTE (see native/README.md "what is NOT verified here"): this is
 * the single highest-uncertainty file in the whole module. Every `xcode`
 * package call below was checked against its actual installed source
 * (xcode@3.0.1) during this task, not written from memory alone, and this
 * plugin has now been verified end-to-end: `expo prebuild --clean
 * --platform ios` followed by an actual `xcodebuild` (simulator, unsigned)
 * SUCCEEDED, compiling all three extension targets' Swift sources.
 */
const fs = require('node:fs')
const path = require('node:path')
const plist = require('plist')
const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins')

/** native/modules/ampora-ignition (one level up from plugin/). */
const MODULE_ROOT = path.resolve(__dirname, '..')
const EXTENSIONS_SRC = path.join(MODULE_ROOT, 'ios', 'extensions')
const SHARED_SWIFT_FILE = path.join(MODULE_ROOT, 'ios', 'AppGroupStore.swift')

/**
 * Maps each app.config.ts APP_EXTENSIONS `targetName` to the folder it copies
 * from and the frameworks its Sources need linked. Kept HERE (not in
 * app.config.ts) because "which Swift files / frameworks this target
 * compiles" is this plugin's own concern, not the shared app-config's, which
 * only owns entitlements + bundle identifiers (docs/05 §2).
 */
const EXTENSION_DEFS = {
  AmporaDeviceActivityMonitor: {
    sourceDir: 'DeviceActivityMonitor',
    swiftFile: 'DeviceActivityMonitorExtension.swift',
    frameworks: ['DeviceActivity.framework', 'FamilyControls.framework', 'ManagedSettings.framework'],
  },
  AmporaShieldConfiguration: {
    sourceDir: 'ShieldConfiguration',
    swiftFile: 'ShieldConfigurationExtension.swift',
    frameworks: ['ManagedSettings.framework', 'ManagedSettingsUI.framework', 'UIKit.framework'],
  },
  AmporaShieldAction: {
    sourceDir: 'ShieldAction',
    swiftFile: 'ShieldActionExtension.swift',
    frameworks: ['ManagedSettings.framework', 'ManagedSettingsUI.framework', 'UserNotifications.framework'],
  },
}

function getAppExtensions(config) {
  return config.extra?.eas?.build?.experimental?.ios?.appExtensions ?? []
}

/**
 * Sets a build setting on every XCBuildConfiguration (Debug + Release) that
 * belongs to `target`, bypassing `xcode`'s own
 * `updateBuildProperty(..., targetName)` scoping path entirely.
 *
 * WHY: confirmed against xcode@3.0.1's actual source
 * (node_modules/xcode/lib/pbxProject.js) and against a real generated
 * project — `updateBuildProperty(prop, value, build, targetName)` resolves
 * `targetName` via `pbxTargetByName`, which is `pbxItemByComment(name,
 * 'PBXNativeTarget')`: it looks for a PBXNativeTarget section entry whose
 * COMMENT equals the plain `name` string. But `addTarget` (same file) sets
 * the new native target's `name` field to the LITERAL string
 * `'"' + targetName + '"'` — i.e. including the quote characters — and
 * `addToPbxNativeTargetSection` copies that exact literal value in as the
 * section's comment. Quotes only get stripped once the project round-trips
 * through a pbxproj write + re-parse; for a target added and configured
 * within the SAME withXcodeProject mod invocation (our case — no disk
 * round-trip in between), `pbxTargetByName(targetName)` returns null.
 * `updateBuildProperty` then builds its `validConfigs` allow-list from that
 * null target (staying empty) and, because `targetName` is truthy, skips
 * every XCBuildConfiguration in the project (`if (targetName &&
 * !validConfigs.includes(configName)) continue`) — so the call is a total,
 * silent no-op. Verified directly: calling `addTarget` then immediately
 * `pbxTargetByName` on that same target name in one process returns null.
 *
 * This is why CODE_SIGN_ENTITLEMENTS, SWIFT_VERSION,
 * IPHONEOS_DEPLOYMENT_TARGET, and TARGETED_DEVICE_FAMILY were all silently
 * missing from the generated extension targets' build settings (confirmed
 * by inspecting a real `expo prebuild` output) — SWIFT_VERSION defaulting to
 * '' is what triggers "SWIFT_VERSION '' is unsupported" from xcodebuild.
 * (LD_RUNPATH_SEARCH_PATHS looked fine only because `addTarget` seeds that
 * one property directly in its initial buildSettings, not because our call
 * worked.)
 *
 * `target` here must be the object `project.addTarget(...)` returned
 * (`{ uuid, pbxNativeTarget }`), so we read `buildConfigurationList`
 * straight off it instead of re-resolving the target by (broken) name
 * lookup.
 */
function setTargetBuildProperty(project, target, prop, value) {
  const configListUuid = target.pbxNativeTarget.buildConfigurationList
  const configList = project.pbxXCConfigurationList()[configListUuid]
  const buildConfigSection = project.pbxXCBuildConfigurationSection()

  for (const { value: buildConfigUuid } of configList.buildConfigurations) {
    buildConfigSection[buildConfigUuid].buildSettings[prop] = value
  }
}

function withAmporaExtensionTargets(config) {
  config = withCopiedExtensionFiles(config)
  config = withRegisteredExtensionTargets(config)
  return config
}

/** Step 1: copy Swift + Info.plist + a generated .entitlements per extension into the prebuilt ios/ tree. */
function withCopiedExtensionFiles(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      // Introspection (e.g. `expo config --json`, EAS's config diffing) must
      // never touch the filesystem (@expo/config-plugins' own ModProps
      // contract) — skip the copy entirely rather than write files nobody
      // asked for.
      if (cfg.modRequest.introspect) return cfg

      const projectRoot = cfg.modRequest.platformProjectRoot // .../ios
      const extensions = getAppExtensions(cfg)

      if (extensions.length === 0) {
        console.warn(
          'ampora-ignition plugin: config.extra.eas.build.experimental.ios.appExtensions is empty — ' +
            'expected 3 entries from app.config.ts. No extension files were copied.'
        )
      }

      for (const ext of extensions) {
        const def = EXTENSION_DEFS[ext.targetName]
        if (!def) {
          console.warn(
            `ampora-ignition plugin: no EXTENSION_DEFS entry for target "${ext.targetName}" -- skipping its file copy. ` +
              'Add an entry in native/modules/ampora-ignition/plugin/withExtensionTargets.js if this is a real extension.'
          )
          continue
        }

        const destDir = path.join(projectRoot, ext.targetName)
        fs.mkdirSync(destDir, { recursive: true })

        fs.copyFileSync(path.join(EXTENSIONS_SRC, def.sourceDir, def.swiftFile), path.join(destDir, def.swiftFile))

        // Shared App Group helper: ONE canonical source file
        // (native/README.md), copied into every extension folder that needs
        // it because these are plain Xcode targets, not CocoaPods pods that
        // could share a podspec dependency the way the main module does.
        fs.copyFileSync(SHARED_SWIFT_FILE, path.join(destDir, 'AppGroupStore.swift'))

        // Named to match `xcode`'s own addTarget default INFOPLIST_FILE
        // convention (`<subfolder>/<subfolder>-Info.plist`, see
        // node_modules/xcode/lib/pbxProject.js's addTarget) so no extra
        // updateBuildProperty call is needed to point at it.
        fs.copyFileSync(
          path.join(EXTENSIONS_SRC, def.sourceDir, 'Info.plist'),
          path.join(destDir, `${ext.targetName}-Info.plist`)
        )

        // Generated from the SAME entitlements object app.config.ts already
        // computed for this extension (ext.entitlements) — one source of
        // truth for the entitlement SET, even though this plugin is what
        // materializes it as an actual file on disk.
        const entitlementsPath = path.join(destDir, `${ext.targetName}.entitlements`)
        fs.writeFileSync(entitlementsPath, plist.build(ext.entitlements ?? {}))
      }

      return cfg
    },
  ])
}

/** Step 2: register each extension as a real Xcode target and wire its build settings. */
function withRegisteredExtensionTargets(config) {
  return withXcodeProject(config, (cfg) => {
    if (cfg.modRequest.introspect) return cfg

    const project = cfg.modResults
    const extensions = getAppExtensions(cfg)

    for (const ext of extensions) {
      const def = EXTENSION_DEFS[ext.targetName]
      if (!def) continue

      // Already-added guard: `withRunOnce`-wrapped plugins still re-run their
      // inner mods on a repeated `prebuild --clean`-less invocation in some
      // Expo CLI versions; addTarget has no built-in idempotency check, so
      // skip creating a target that is already in the project rather than
      // risk a duplicate.
      if (project.pbxTargetByName(ext.targetName)) continue

      // `addTarget` (node_modules/xcode/lib/pbxProject.js:1413) creates the
      // target, its own Debug/Release XCBuildConfigurations (seeded with
      // INFOPLIST_FILE = "<subfolder>/<subfolder>-Info.plist" and
      // PRODUCT_BUNDLE_IDENTIFIER from the 4th arg), AND — because the type
      // is 'app_extension' — a "Copy Files" build phase on the FIRST (main
      // app) target that embeds this extension's .appex product (see that
      // method's `if (targetType === 'app_extension')` branch). That embed
      // step is why this mod is sufficient on its own.
      const target = project.addTarget(ext.targetName, 'app_extension', ext.targetName, ext.bundleIdentifier)

      const sourceFiles = [def.swiftFile, 'AppGroupStore.swift'].map((f) => path.posix.join(ext.targetName, f))
      project.addBuildPhase(sourceFiles, 'PBXSourcesBuildPhase', 'Sources', target.uuid)
      project.addBuildPhase([], 'PBXResourcesBuildPhase', 'Resources', target.uuid)
      project.addBuildPhase([], 'PBXFrameworksBuildPhase', 'Frameworks', target.uuid)

      for (const framework of def.frameworks) {
        project.addFramework(framework, { target: target.uuid })
      }

      // Scoped to JUST this target's own XCBuildConfigurations via
      // `setTargetBuildProperty` (see its doc comment — `updateBuildProperty(...,
      // targetName)` is a silent no-op here because of an xcode@3.0.1 name-
      // lookup bug) — NOT `addBuildProperty`, which applies to every build
      // configuration in the WHOLE PROJECT (see its source in the same
      // file): using it here would wrongly stamp one extension's
      // entitlements path onto the main app and the other two extensions.
      const entitlementsRelPath = path.posix.join(ext.targetName, `${ext.targetName}.entitlements`)
      setTargetBuildProperty(project, target, 'CODE_SIGN_ENTITLEMENTS', `"${entitlementsRelPath}"`)
      // '5.0', not '5.9' — Xcode's SWIFT_VERSION only accepts the language-mode
      // values it lists on error (4.0, 4.2, 5.0, 6.0 as of Xcode 26.6), not
      // full toolchain versions like '5.9'.
      setTargetBuildProperty(project, target, 'SWIFT_VERSION', '5.0')
      // Must match AmporaIgnition.podspec's `s.platforms = { ios: '16.0' }` —
      // FamilyControls' `.individual` authorization needs iOS 16+.
      setTargetBuildProperty(project, target, 'IPHONEOS_DEPLOYMENT_TARGET', '16.0')
      setTargetBuildProperty(project, target, 'TARGETED_DEVICE_FAMILY', '"1,2"')
      // Extensions embed into the host app's Frameworks directory rather
      // than shipping their own Swift runtime copy.
      setTargetBuildProperty(
        project,
        target,
        'LD_RUNPATH_SEARCH_PATHS',
        '"$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"'
      )
    }

    return cfg
  })
}

module.exports = { withAmporaExtensionTargets, EXTENSION_DEFS }
