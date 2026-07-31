const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const NATIVE = require("./constants/nativeFlags");

const config = getDefaultConfig(__dirname);

// Transform import.meta.env references for web compatibility
// (zustand v5 uses import.meta.env which fails in Metro's non-module output)
config.transformer = {
  ...config.transformer,
  unstable_allowRequireContext: true,
};

// ---------------------------------------------------------------------------
// NATIVE ISOLATION (ARCH_PLAN B3) — the mechanism, not a nicety.
//
// Metro resolves string-literal `require()`/`import` specifiers STATICALLY at
// bundle time. A `try { require('react-native-purchases') } catch {}` therefore
// FAILS THE BUILD when the package is not installed — the try/catch never runs.
// This resolver alias is what actually makes those packages optional: while the
// native path is off (the permanent state of every shared branch, and always
// the case on Windows), every specifier below resolves to `core/native/
// optionalStub.js`, which exports `null`, so each call site takes its existing
// "native module absent" fail-safe branch.
//
// Web NEVER gets a native package, flag or no flag: a browser cannot enforce
// app-blocking (doc 05 §1) and RevenueCat's RN SDK has no web binary.
// ---------------------------------------------------------------------------

/** Packages that exist only in a native build. Keep in sync with `native/package-additions.json`. */
const OPTIONAL_NATIVE_PACKAGES = new Set([
  "react-native-device-activity",
  "react-native-purchases",
  "ampora-ignition",
  "ampora-purchases",
  // Sign in with Apple (FR-87). Resolved by services/supabase.ts via a lazy
  // require() call, same pattern as react-native-purchases above — never
  // installed on Windows/web/Android, so it needs the same alias-to-stub
  // treatment or `expo export --platform web` fails trying to resolve it.
  "expo-apple-authentication",
]);

const STUB = path.resolve(__dirname, "core/native/optionalStub.js");

/** Metro's blockList is either a RegExp or an array of them; normalize to an array. */
function toRegExpArray(blockList) {
  if (!blockList) return [];
  return Array.isArray(blockList) ? blockList : [blockList];
}

// While native is off, hide `native/modules/**` from Metro's crawler entirely so
// the nested module `package.json` files can never participate in resolution.
// `native/modules/` (rather than `modules/`) is also why nothing autolinks by
// accident: `modules/` is Expo autolinking's DEFAULT nativeModulesDir.
const nativeModulesBlock = /[\\/]native[\\/]modules[\\/].*/;

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver = {
  ...config.resolver,
  unstable_enablePackageExports: true,
  unstable_conditionNames: ["browser", "require", "react-native"],
  blockList: NATIVE.ANY_NATIVE
    ? toRegExpArray(config.resolver.blockList)
    : [...toRegExpArray(config.resolver.blockList), nativeModulesBlock],
  resolveRequest: (context, moduleName, platform) => {
    const optional = OPTIONAL_NATIVE_PACKAGES.has(moduleName);
    if (optional && (!NATIVE.ANY_NATIVE || platform === "web")) {
      return { type: "sourceFile", filePath: STUB };
    }
    return (defaultResolveRequest ?? context.resolveRequest)(context, moduleName, platform);
  },
};

module.exports = withNativeWind(config, {
  input: "./global.css",
});
