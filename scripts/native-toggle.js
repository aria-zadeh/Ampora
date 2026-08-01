#!/usr/bin/env node
/**
 * native-toggle.js — `npm run native:on | native:off | native:status`
 *
 * Writes EXACTLY ONE FILE: `native.config.json`. Nothing else. It does not run
 * `npm install`, it does not run `expo prebuild`, and it does not edit
 * `package.json`, `app.json`, `tsconfig.json` or any source file. Those steps
 * are macOS-only and `prebuild` writes a gitignored `ios/` directory, so a
 * human runs them knowingly rather than having a toggle do it behind their
 * back. This script just prints them.
 *
 * Usage:
 *   node scripts/native-toggle.js status
 *   node scripts/native-toggle.js on   [ignition|purchases|all]   (default: all)
 *   node scripts/native-toggle.js off  [ignition|purchases|all]   (default: all)
 *
 * ⚠️  PERMANENT INVARIANT (native/README.md): `native.config.json` is committed
 * with every flag FALSE on every shared branch, always. If you turn native on
 * locally, turn it back off before you commit. Shipping native goes through the
 * `-native` EAS profiles, which set `AMPORA_NATIVE=1` in the build environment
 * instead. That is what keeps `npx tsc --noEmit` at 0 errors and
 * `npx expo export --platform web` working on a Windows machine that cannot
 * build iOS at all.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '..')
const FLAG_FILE = path.join(ROOT, 'native.config.json')
const ADDITIONS_FILE = path.join(ROOT, 'native', 'package-additions.json')

const FLAG_KEYS = { ignition: 'ignitionNative', purchases: 'purchases' }

const COMMENT =
  'PERMANENT INVARIANT: this file is committed with EVERY flag false on every shared branch, always. ' +
  'See native/README.md. Native builds are produced by the `-native` EAS profiles (which set AMPORA_NATIVE=1), ' +
  'never by committing a flipped flag. Flip locally with `npm run native:on` and flip back before committing.'

// ---------------------------------------------------------------------------

/** Read the flag file. Never throws — an unreadable file reads as all-false. */
function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FLAG_FILE, 'utf8'))
    return {
      ignitionNative: parsed?.ignitionNative === true,
      purchases: parsed?.purchases === true,
    }
  } catch {
    return { ignitionNative: false, purchases: false }
  }
}

/** Write the flag file — the ONLY write this script ever performs. */
function write(flags) {
  const body = {
    $comment: COMMENT,
    ignitionNative: flags.ignitionNative === true,
    purchases: flags.purchases === true,
  }
  fs.writeFileSync(FLAG_FILE, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
}

/** The npm packages a native build needs, from `native/package-additions.json`. */
function readAdditions() {
  try {
    return JSON.parse(fs.readFileSync(ADDITIONS_FILE, 'utf8'))
  } catch {
    return null
  }
}

function targetsFrom(arg) {
  const which = (arg || 'all').toLowerCase()
  if (which === 'all') return ['ignition', 'purchases']
  if (which in FLAG_KEYS) return [which]
  fail(`unknown target "${arg}". Expected one of: ignition, purchases, all.`)
  return []
}

function fail(message) {
  console.error(`native-toggle: ${message}`)
  process.exit(1)
}

function tick(on) {
  return on ? 'ON ' : 'off'
}

// ---------------------------------------------------------------------------

function printStatus() {
  const flags = read()
  const envOverride = process.env.AMPORA_NATIVE === '1'
  const effective = {
    ignitionNative: envOverride || flags.ignitionNative,
    purchases: envOverride || flags.purchases,
  }

  console.log('')
  console.log('  Ampora native isolation — status')
  console.log('  --------------------------------')
  console.log(`  flag file          ${path.relative(ROOT, FLAG_FILE)}`)
  console.log(`  AMPORA_NATIVE env  ${envOverride ? '1 (OVERRIDES the file — everything on)' : 'unset'}`)
  console.log('')
  console.log(`  ignitionNative     file=${tick(flags.ignitionNative)}   effective=${tick(effective.ignitionNative)}`)
  console.log(`  purchases          file=${tick(flags.purchases)}   effective=${tick(effective.purchases)}`)
  console.log('')

  if (!effective.ignitionNative && !effective.purchases) {
    console.log('  Native is OFF. This is the correct committed state.')
    console.log('    - `tsc` never sees native/** (tsconfig.json excludes it)')
    console.log('    - Metro aliases every optional native package to core/native/optionalStub.js')
    console.log('    - app.config.ts returns app.json unchanged')
    console.log('    - getBlockingStrategy() returns the SoftBlockingStrategy')
  } else {
    console.log('  ⚠️  Native is ON. Do NOT commit native.config.json in this state.')
    console.log('     Run `npm run native:off` before committing.')
  }
  console.log('')
}

function printOnInstructions(targets) {
  const additions = readAdditions()
  console.log('')
  console.log('  Native ON — remaining steps are macOS-only and NOT run by this script:')
  console.log('')
  console.log('  1. Install the optional native packages (they are deliberately absent from')
  console.log('     package.json so a Windows `npm install` never pulls them in):')
  if (additions) {
    for (const group of Object.keys(additions.groups || {})) {
      if (!targets.includes(group)) continue
      const pkgs = additions.groups[group].dependencies || {}
      const spec = Object.entries(pkgs)
        .map(([name, version]) => `${name}@${version}`)
        .join(' ')
      if (spec) console.log(`       npx expo install ${spec}`)
    }
  } else {
    console.log('       (native/package-additions.json not found — see native/README.md)')
  }
  console.log('')
  console.log('  2. Confirm package.json still contains the permanent autolinking line:')
  console.log('       "expo": { "autolinking": { "nativeModulesDir": "./native/modules" } }')
  console.log('')
  console.log('  3. Generate the native project (writes a gitignored ios/):')
  console.log('       npx expo prebuild --platform ios --clean')
  console.log('')
  console.log('  4. Typecheck the native tree too:')
  console.log('       npm run typecheck:native')
  console.log('')
  console.log('  5. Build through an EAS `-native` profile, e.g.:')
  console.log('       eas build --profile development-native --platform ios')
  console.log('')
  console.log('  ⚠️  Turn this back off (`npm run native:off`) before committing.')
  console.log('')
}

// ---------------------------------------------------------------------------

const [, , rawCommand, rawTarget] = process.argv
const command = (rawCommand || 'status').toLowerCase()

if (command === 'status') {
  printStatus()
  process.exit(0)
}

if (command !== 'on' && command !== 'off') {
  fail(`unknown command "${rawCommand}". Expected: on | off | status.`)
}

const targets = targetsFrom(rawTarget)
const next = read()
for (const target of targets) next[FLAG_KEYS[target]] = command === 'on'
write(next)

console.log(`native-toggle: wrote ${path.relative(ROOT, FLAG_FILE)} (${targets.join(', ')} → ${command})`)
printStatus()
if (command === 'on') printOnInstructions(targets)
