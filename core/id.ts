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

/**
 * Deterministic, UUID-v4-shaped id derived from `parts`. For entities whose
 * identity IS its inputs — chiefly a `ScheduledBlock`, uniquely identified by
 * its task and time slot (PRD §9.5.10 stability) — this is required for
 * `recompute()` to be byte-identical across runs given identical input (NFR-2
 * "deterministic"): `newId()`'s `Math.random()` source means two independent
 * calls never mint the same id for what is otherwise the exact same block.
 *
 * `newId()` stays random for everything else (tasks, lists, subtasks are
 * created across devices and need global uniqueness, not idempotence).
 *
 * Not cryptographic — a simple string hash seeding a small xorshift PRNG,
 * kept dependency-free like `newId()`. Collision risk is irrelevant here
 * because the input already IS the entity's unique identity, so two calls
 * with different `parts` colliding would require a genuine hash collision,
 * not just bad luck of a random draw.
 */
export function stableId(...parts: (string | number)[]): string {
  const seed = parts.join('|')
  let state = 0
  for (let i = 0; i < seed.length; i++) {
    state = (Math.imul(state, 31) + seed.charCodeAt(i)) | 0
  }
  if (state === 0) state = 0x9e3779b9 // avoid the all-zero xorshift fixed point

  function next(): number {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    return state
  }

  const template = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  let result = ''
  for (let i = 0; i < template.length; i++) {
    const c = template[i]
    if (c !== 'x' && c !== 'y') {
      result += c
      continue
    }
    const r = Math.abs(next()) % 16
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    result += v.toString(16)
  }
  return result
}
