/**
 * Small pure helpers for the Projects UI (doc `06`). Kept out of components so
 * the derivation stays testable and consistent across ProjectCard / detail /
 * progress tracker. No I/O, no platform deps — web-safe.
 */

import type { Ionicons } from "@expo/vector-icons";
import type { ProjectKind } from "@/types";
import { colors } from "@/utils/design-tokens";

/** The project theme accent (doc `02` — Projects use the "special/premium" accent, reserved exclusively for Projects). */
export const PROJECT_ACCENT = colors.light.accentStrong;
export const PROJECT_ACCENT_LIGHT = colors.light.accentLight;

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
        blurb: "A paper or big assignment — tracked as ordered phases to a due date.",
      };
    case "study":
      return {
        label: "Study",
        icon: "school-outline",
        blurb: "An exam or unit — tracked as a topic list, done one at a time.",
      };
  }
}
