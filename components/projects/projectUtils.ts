/**
 * Small pure helpers for the Projects UI (doc `06`). Kept out of components so
 * the derivation stays testable and consistent across ProjectCard / detail /
 * progress tracker. No I/O, no platform deps — web-safe.
 *
 * The project accent color used to live here as a plain `PROJECT_ACCENT`
 * constant, but a plain module has no React context to resolve it against
 * the active theme, so it always pinned to the light-theme hex. Every call
 * site is a component, so each now resolves its own `theme.accent` via
 * `useThemeColors()` instead — see `docs/02` §13.1 (accent is AI/smart/
 * Projects only).
 */

import type { Ionicons } from "@expo/vector-icons";
import type { ProjectKind } from "@/types";

interface KindMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One-line description of the kind, for the new-project chooser. */
  blurb: string;
}

/** Display metadata for each project kind (doc `06` §3). */
export function kindMeta(kind: ProjectKind): KindMeta {
  switch (kind) {
    case "deliverable":
      return {
        label: "Deliverable",
        icon: "document-text-outline",
        blurb: "A paper or big assignment. Tracked as ordered phases to a due date.",
      };
    case "study":
      return {
        label: "Study",
        icon: "school-outline",
        blurb: "An exam or unit. Tracked as a topic list, done one at a time.",
      };
  }
}
