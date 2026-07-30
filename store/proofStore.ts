/**
 * Proof store — Ampora Phase 4 (verification / Proof Log, PRD FR-77/78, doc 09).
 *
 * A private, local-first log of verification artifacts. Every time a task is
 * completed through the VerificationSheet, one `Proof` is appended here (doc 09
 * §2: "The image is saved to a private Proof Log the user can look back on").
 *
 * The Proof Log is the user's own record of work done — motivating, never
 * reported anywhere (doc 09 §4/§8). Because verification is lenient by design
 * (FR-78, doc 09 §5), a Proof may carry `aiVerdict: "uncertain"` and/or
 * `overridden: true` and still be recorded — the log is a history, not a gate.
 *
 * Local-first via MMKV (persist key "ampora-proofs"), same pattern as the other
 * Phase-1..3 stores. Proofs are keyed by id (`Record<string, Proof>`) so the
 * store never holds an array in state (avoids the Zustand v5 array-selector
 * infinite-loop footgun); array views are produced by the exported selectors.
 */

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { newId } from "@/core/id";
import { mmkvStateStorage } from "@/store/mmkv";
import { PROOFS_PERSIST_VERSION, migrateProofs } from "@/store/migrations/proofs";
import type { Proof } from "@/types";

/**
 * Everything a caller must/can supply when recording a proof. `id` and `at`
 * are filled in by the store when omitted, so the common call is just
 * `addProof({ sessionId, method })`.
 */
export type NewProof = Omit<Proof, "id" | "at"> & { id?: string; at?: number };

interface ProofState {
  /** All recorded proofs, keyed by id. */
  proofs: Record<string, Proof>;

  /** Append a proof. Returns the stored `Proof` (with generated id/at). */
  addProof: (partial: NewProof) => Proof;
  /** Remove a proof by id (e.g. if the user clears an entry). */
  removeProof: (id: string) => void;
  /** Clear the entire Proof Log. */
  clear: () => void;
}

export const useProofStore = create<ProofState>()(
  persist(
    (set) => ({
      proofs: {},

      addProof: (partial) => {
        const proof: Proof = {
          ...partial,
          id: partial.id ?? newId(),
          at: partial.at ?? Date.now(),
        };
        set((state) => ({ proofs: { ...state.proofs, [proof.id]: proof } }));
        return proof;
      },

      removeProof: (id) => {
        set((state) => {
          if (!(id in state.proofs)) return state;
          const next = { ...state.proofs };
          delete next[id];
          return { proofs: next };
        });
      },

      clear: () => set({ proofs: {} }),
    }),
    {
      name: "ampora-proofs",
      storage: createJSONStorage(() => mmkvStateStorage),
      version: PROOFS_PERSIST_VERSION,
      // v0 -> v1 drops the deferred `word_count` / `screen_aware` tiers. Rows
      // are REMAPPED, never deleted: the Proof Log is the user's own record of
      // work done, and erasing it during an upgrade is the worst outcome
      // available (doc `04` §4). The assertion is safe — zustand merges this
      // slice over the complete initial state, restoring the actions.
      migrate: (persisted, version) => migrateProofs(persisted, version) as ProofState,
    }
  )
);

// ---------------------------------------------------------------------------
// Selectors — keep array derivation out of components. These take state and
// return a fresh array; call them via a plain `useProofStore(selectProofs(n))`
// wrapped in `useShallow` at the call site if the identity churn matters, or
// read `proofs` and derive with `useMemo` (PRD §9.1 selector discipline).
// ---------------------------------------------------------------------------

/**
 * Proofs newest-first, capped at `limit`. `limit` defaults to a generous
 * window; pass a small number for compact previews.
 */
export function selectProofs(limit = 50) {
  return (state: ProofState): Proof[] =>
    Object.values(state.proofs)
      .sort((a, b) => b.at - a.at)
      .slice(0, limit);
}

/** All proofs for a single session, newest-first. */
export function selectProofsForSession(sessionId: string) {
  return (state: ProofState): Proof[] =>
    Object.values(state.proofs)
      .filter((p) => p.sessionId === sessionId)
      .sort((a, b) => b.at - a.at);
}
