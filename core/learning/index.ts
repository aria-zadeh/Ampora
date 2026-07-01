/**
 * Ampora Learning Engine — portable core (PRD FR-50..55, §9.5.5-9.5.9).
 *
 * Pure, deterministic, dependency-free (no I/O, no clock read beyond a passed
 * `now`, no platform APIs) so the same logic runs on-device and in Edge
 * Functions (doc 08 §1). Everything is cold-start safe: with little/no data it
 * returns neutral, low-confidence results so the app can show a "still
 * learning" state instead of confident (and wrong) claims (FR-55).
 *
 * Four capabilities:
 *   - focusDna       -> FocusProfile (best windows, dodged types, ignition point)
 *   - revealedSelf   -> planned-vs-actual start gap ("you plan X, you do Y")
 *   - energyState    -> low | normal | hyper + a today re-sort comparator
 *   - estimation     -> per-task-type EWMA duration multiplier (time-blindness)
 */

export {
  focusDna,
  bestWindows,
  dodgedTaskTypes,
  conditionsThatHelp,
  ignitionPoint,
  emptyFocusProfile,
  confidenceFactor,
  FOCUS_DNA_FULL_CONFIDENCE_SAMPLES,
} from './focusDna'

export {
  revealedSelf,
  allRevealedSelves,
  REVEALED_SELF_MIN_SAMPLES,
  REVEALED_SELF_MIN_GAP_HOURS,
  type RevealedSelf,
} from './revealedSelf'

export {
  energyState,
  energyResortComparator,
  resortForEnergy,
  type EnergyState,
} from './energy'

export {
  estimation,
  applyEstimation,
  observationsFromSignals,
  NEUTRAL_MULTIPLIER,
  ESTIMATION_MIN_MULTIPLIER,
  ESTIMATION_MAX_MULTIPLIER,
  type EstimationResult,
  type DurationObservation,
} from './estimation'
