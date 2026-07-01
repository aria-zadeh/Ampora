/**
 * Collision-resistant id generation, shared by the app and (later) a
 * server-side engine (PRD §9.16 — the scheduling/breakdown modules are
 * portable TypeScript run both on-device and in Edge Functions).
 *
 * Pure JS only. No react-native / expo / MMKV / Node-only imports, so this
 * is importable from plain Node for future tests and from an Edge Function.
 */

/**
 * Returns a collision-resistant, UUID-v4-shaped id.
 *
 * Uses `Math.random()` rather than a crypto RNG so this file has zero
 * dependencies and works identically in RN, plain Node, and edge runtimes.
 * This is fine for entity ids (not used for security-sensitive tokens).
 */
export function newId(): string {
  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  let result = ''
  for (let i = 0; i < template.length; i++) {
    const c = template[i]
    if (c !== 'x' && c !== 'y') {
      result += c
      continue
    }
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    result += v.toString(16)
  }
  return result
}
