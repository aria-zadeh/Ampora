/**
 * Small pure helpers for the Projects UI (doc `10`). Kept out of components so
 * the derivation stays testable and consistent across ProjectCard / detail /
 * progress tracker. No I/O, no platform deps — web-safe.
 */

import type { Ionicons } from "@expo/vector-icons";
import type { ProjectKind, ProjectProgress } from "@/types";

/** The project theme accent (doc `02` — projects use the "special/premium" accent). */
export const PROJECT_ACCENT = "#7C3AED";
export const PROJECT_ACCENT_LIGHT = "#EDE9FE";

function clampPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

/** Overall percent-complete for any progress shape, 0..100 (rounded). Mirrors services/aiProjects. */
export function overallPct(progress: ProjectProgress): number {
  switch (progress.kind) {
    case "general":
      return clampPct(progress.pct);
    case "deliverable": {
      if (progress.phases.length === 0) return 0;
      const sum = progress.phases.reduce((acc, p) => acc + clampPct(p.pct), 0);
      return Math.round(sum / progress.phases.length);
    }
    case "study": {
      if (progress.topics.length === 0) return 0;
      const sum = progress.topics.reduce((acc, t) => acc + clamp01(t.mastery), 0);
      return Math.round((sum / progress.topics.length) * 100);
    }
  }
}

interface KindMeta {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  /** One-line description of the kind, for the new-project chooser. */
  blurb: string;
}

/** Display metadata for each project kind (doc `10` §3). */
export function kindMeta(kind: ProjectKind): KindMeta {
  switch (kind) {
    case "deliverable":
      return {
        label: "Deliverable",
        icon: "document-text-outline",
        blurb: "A paper or big assignment — tracked as phases to a due date.",
      };
    case "study":
      return {
        label: "Study",
        icon: "school-outline",
        blurb: "An exam or unit — tracked as topics with mastery.",
      };
    case "general":
    default:
      return {
        label: "General",
        icon: "albums-outline",
        blurb: "Ongoing work that doesn't fit the other two.",
      };
  }
}
