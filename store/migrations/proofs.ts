/**
 * `ampora-proofs` persisted-state migration (v0 -> v1).
 *
 * Word-count and screen-activity verification are deferred (`V2_Changes.md`
 * §3), which drops `Proof['method']` to four values. The rule here is that a
 * proof row is REMAPPED, never deleted:
 *
 * - `word_count` -> `honor`. It was a self-reported claim; honor is the tier
 *   for a self-reported claim.
 * - `screen_aware` -> `focus_time`. It was app-observed activity; focus-time is
 *   the tier for app-observed activity.
 *
 * The Proof Log is the user's own private record of work they actually did
 * (doc `04` §4, FR-77). Silently erasing a chunk of it during an upgrade is the
 * worst available outcome, and it would land on exactly the population least
 * able to shrug it off. An imperfect label on a real memory beats a missing
 * memory.
 *
 * Pure module: types only. No MMKV, no store imports.
 */

import type { Proof } from '@/types'

/** The current persisted schema version for `ampora-proofs`. */
export const PROOFS_PERSIST_VERSION = 1

/** What the proof store persists (actions are not serialized). */
export interface PersistedProofsState {
  proofs: Record<string, Proof>
}

/** v0 -> v1 method remap. Anything already valid passes through untouched. */
const METHOD_REMAP: Record<string, Proof['method']> = {
  honor: 'honor',
  focus_time: 'focus_time',
  photo: 'photo',
  screenshot: 'screenshot',
  // Retired tiers, preserved by remap.
  word_count: 'honor',
  screen_aware: 'focus_time',
}

/**
 * Map one persisted method onto a v1 method. An unrecognised value falls back
 * to `honor` — the tier that claims the least — rather than dropping the row.
 */
export function migrateProofMethod(raw: unknown): Proof['method'] {
  if (typeof raw !== 'string') return 'honor'
  return METHOD_REMAP[raw] ?? 'honor'
}

/**
 * v0 -> v1 migration for the `ampora-proofs` blob. Rows without an id or a
 * timestamp are skipped (they cannot be keyed or ordered), everything else is
 * kept with its method remapped.
 */
export function migrateProofs(persisted: unknown, _version: number): PersistedProofsState {
  const container = persisted && typeof persisted === 'object' ? (persisted as { proofs?: unknown }) : {}
  const raw = container.proofs
  const proofs: Record<string, Proof> = {}
  if (raw && typeof raw === 'object') {
    for (const value of Object.values(raw as Record<string, Partial<Proof>>)) {
      if (!value || typeof value !== 'object') continue
      const id = typeof value.id === 'string' ? value.id : ''
      const at = typeof value.at === 'number' && Number.isFinite(value.at) ? value.at : undefined
      if (!id || at === undefined) continue
      const proof: Proof = {
        id,
        sessionId: typeof value.sessionId === 'string' ? value.sessionId : '',
        method: migrateProofMethod(value.method),
        at,
      }
      if (typeof value.uri === 'string') proof.uri = value.uri
      if (value.aiVerdict === 'pass' || value.aiVerdict === 'uncertain') proof.aiVerdict = value.aiVerdict
      if (typeof value.overridden === 'boolean') proof.overridden = value.overridden
      proofs[id] = proof
    }
  }
  return { proofs }
}
