/**
 * optionalStub.js — what Metro resolves an OPTIONAL NATIVE PACKAGE to whenever
 * the native path is off (and always on web).
 *
 * THE PROBLEM THIS SOLVES (ARCH_PLAN B0, failure mode 2):
 * Metro resolves string-literal `require()`/`import` specifiers STATICALLY, at
 * bundle time, before any of your code runs. So this:
 *
 *     try { mod = require('react-native-purchases') } catch { mod = null }
 *
 * does NOT isolate anything — if the package is not in `node_modules`, the
 * bundle fails to build and the try/catch never gets a chance to run. A
 * try/catch is not isolation. The `resolveRequest` alias in `metro.config.js`
 * that points those specifiers at THIS file is what actually provides it.
 *
 * Exporting `null` (rather than an object with fake methods) is deliberate:
 * every call site already has to handle "the native module is not present", and
 * `null` makes it take that existing fail-safe branch instead of pretending to
 * lock apps or pretending to own a subscription. Under-lock, never trap
 * (NFR-7, doc 05 §3.10).
 *
 * Interop note: Babel's `_interopRequireDefault` turns a non-`__esModule`
 * export into `{ default: <value> }`, so `import mod from 'react-native-…'`
 * also yields `null` here rather than a namespace object. Named imports off an
 * optional package would throw — which is correct, because app code must reach
 * these packages through `requireOptionalNativeModule(<name>)`, never a static
 * named import.
 *
 * Plain CommonJS `.js` on purpose: it is a Metro resolution target, never part
 * of the `tsc` program.
 */

module.exports = null
