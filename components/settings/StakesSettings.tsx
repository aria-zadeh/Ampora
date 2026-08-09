import React, { useMemo, useState } from "react";
import { View, Text, Modal, Pressable, AccessibilityInfo } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { AppPicker } from "@/components/stakes/AppPicker";
import { useSettingsStore } from "@/store/settingsStore";
import { useStakesStore } from "@/store/stakesStore";
import { colors, shadows } from "@/utils/design-tokens";
import {
  DAILY_LOCK_CAP_BOUNDS,
  DEFAULT_STAKE_STRENGTH,
  SINGLE_SESSION_CAP_BOUNDS,
} from "@/core/blocking/limits";

// ---------------------------------------------------------------------------
// Bounds + copy for the protective caps. Framed as ceilings that keep the
// user safe, never as punishment (§9.10 wellbeing stance).
//
// The BOUNDS themselves are never hand-rolled here, they come straight from
// `core/blocking/limits.ts`, the exact constants `normalizeSettings` clamps
// every write against. This file used to define its own local 30-480 minute
// range for the daily cap against a real enforced ceiling of 15-180, the
// stepper could be pushed well past where every write actually landed, a
// drift a conformance audit caught (FR-65). Sourcing the bounds from one
// place makes that class of drift impossible to reintroduce.
// ---------------------------------------------------------------------------

const DAILY_CAP_STEP = 30;
const SINGLE_CAP_STEP = 5;

/** Human-friendly label for a never-lock category key. */
const CATEGORY_LABELS: Record<string, string> = {
  phone: "Phone & calls",
  messages: "Messages",
  maps: "Maps & navigation",
  accessibility: "Accessibility",
  os_settings: "System settings",
  ampora: "Ampora",
};

/**
 * The 6 safety categories that are ALWAYS reachable and can never be removed
 * (§9.10, doc 06 §4). Enforced client-side (the app never locks these,
 * `store/migrations/settings.ts#safeNeverLock` re-unions them into every
 * normalize) AND, as of `supabase/migrations/20260730000008_...`, server-side
 * too, a CHECK constraint requires every persisted `settings` row's
 * `never_lock_categories` to contain all six. Device-level enforcement (native
 * shielding that itself refuses to lock a protected app) still arrives with
 * native app-locking in Round C, see that migration's header for the exact
 * scope of what "server-side" can mean today. Any extra entries a user added
 * before this screen became view-only (§8.11) live alongside the six but are
 * no longer removable from here either. Compared case-insensitively so a
 * stray-cased persisted value still counts.
 */
const PROTECTED_CATEGORIES = [
  "phone",
  "messages",
  "maps",
  "accessibility",
  "os_settings",
  "ampora",
] as const;

/** Whether a never-lock entry is one of the 6 immovable safety categories. */
function isProtectedCategory(key: string): boolean {
  const needle = key.trim().toLowerCase();
  return PROTECTED_CATEGORIES.some((p) => p === needle);
}

/** "3h 0m" / "45m" style label for a minutes value. */
function formatMinutes(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

/** Pretty category label with a sensible fallback. */
function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key.replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Stake strength (FR-44): fixed sensible defaults plus ONE user-set control,
// no automated calibration. Framed as three bands, never a raw 0..1 number
// the user has to reason about, the same thresholds
// `components/stakes/StakeSetupSheet.tsx` already uses for its own read-only
// badge, mirrored here so the same underlying number always reads as the
// same word everywhere in the app.
// ---------------------------------------------------------------------------

type StrengthBand = "gentle" | "balanced" | "firm";

const STRENGTH_FIRM_THRESHOLD = 0.66;
const STRENGTH_BALANCED_THRESHOLD = 0.4;

/**
 * Anchor value written when the user picks a band. `balanced` intentionally
 * equals the shipped default (`DEFAULT_STAKE_STRENGTH`), so picking the band
 * you're already in is a no-op.
 */
const STRENGTH_BAND_VALUE: Record<StrengthBand, number> = {
  gentle: 0.25,
  balanced: DEFAULT_STAKE_STRENGTH,
  firm: 0.85,
};

const STRENGTH_BANDS: { key: StrengthBand; label: string }[] = [
  { key: "gentle", label: "Gentle" },
  { key: "balanced", label: "Balanced" },
  { key: "firm", label: "Firm" },
];

/** Which band a raw 0..1 strength currently reads as. */
function strengthBandOf(strength: number): StrengthBand {
  if (strength >= STRENGTH_FIRM_THRESHOLD) return "firm";
  if (strength >= STRENGTH_BALANCED_THRESHOLD) return "balanced";
  return "gentle";
}

// ---------------------------------------------------------------------------
// Local presentation primitives
// ---------------------------------------------------------------------------

/** A row inside the group: leading icon bubble, label + optional sublabel, trailing slot. */
function Row({
  icon,
  iconTint = colors.light.textSecondary,
  iconBg = "bg-neutral-100",
  label,
  sublabel,
  trailing,
  isLast = false,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  iconBg?: string;
  label: string;
  sublabel?: string;
  trailing?: React.ReactNode;
  isLast?: boolean;
}) {
  return (
    <View
      className={`flex-row items-center py-3.5 ${
        isLast ? "" : "border-b border-neutral-100"
      }`}
    >
      <View
        className={`h-9 w-9 items-center justify-center rounded-full ${iconBg}`}
      >
        <Ionicons name={icon} size={18} color={iconTint} />
      </View>
      <View className="ml-3 flex-1 pr-3">
        <Text className="text-body-lg text-neutral-900">{label}</Text>
        {sublabel ? (
          <Text className="mt-0.5 text-caption text-neutral-500">{sublabel}</Text>
        ) : null}
      </View>
      {trailing}
    </View>
  );
}

/** A -/+ stepper for a minutes value. Clamps to [min, max]. */
function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  a11yLabel,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  a11yLabel: string;
}) {
  const atMin = value <= min;
  const atMax = value >= max;

  const bump = (dir: -1 | 1) => {
    const next = Math.min(max, Math.max(min, value + dir * step));
    if (next === value) return;
    Haptics.selectionAsync().catch(() => {});
    onChange(next);
  };

  return (
    <View className="flex-row items-center">
      <Pressable
        onPress={() => bump(-1)}
        disabled={atMin}
        hitSlop={6}
        className={`h-9 w-9 items-center justify-center rounded-full border border-neutral-200 ${
          atMin ? "opacity-40" : "active:opacity-60"
        }`}
        accessibilityRole="button"
        accessibilityLabel={`Decrease ${a11yLabel}`}
        accessibilityState={{ disabled: atMin }}
      >
        <Ionicons name="remove" size={18} color={colors.light.text} />
      </Pressable>
      <Text
        className="mx-3 min-w-[56px] text-center text-body-lg font-semibold text-neutral-900"
        accessibilityLabel={`${a11yLabel}: ${formatMinutes(value)}`}
      >
        {formatMinutes(value)}
      </Text>
      <Pressable
        onPress={() => bump(1)}
        disabled={atMax}
        hitSlop={6}
        className={`h-9 w-9 items-center justify-center rounded-full border border-neutral-200 ${
          atMax ? "opacity-40" : "active:opacity-60"
        }`}
        accessibilityRole="button"
        accessibilityLabel={`Increase ${a11yLabel}`}
        accessibilityState={{ disabled: atMax }}
      >
        <Ionicons name="add" size={18} color={colors.light.text} />
      </Pressable>
    </View>
  );
}

/**
 * Three-band strength picker (Gentle / Balanced / Firm), the single control
 * FR-44 asks for, never a slider or a raw number. Each pill is a real 44px
 * target (`min-h-11`), and the group carries a radiogroup/radio accessibility
 * shape so the current value and every option read cleanly to a screen reader.
 */
function StrengthPicker({
  band,
  onSelect,
}: {
  band: StrengthBand;
  onSelect: (band: StrengthBand) => void;
}) {
  return (
    <View
      className="flex-row gap-2"
      accessibilityRole="radiogroup"
      accessibilityLabel="Stake strength"
    >
      {STRENGTH_BANDS.map((b) => {
        const selected = b.key === band;
        return (
          <Pressable
            key={b.key}
            onPress={() => onSelect(b.key)}
            hitSlop={4}
            className={`min-h-11 items-center justify-center rounded-full border px-4 ${
              selected ? "border-primary-600 bg-primary-50" : "border-neutral-200 bg-white"
            }`}
            accessibilityRole="radio"
            accessibilityState={{ selected, checked: selected }}
            accessibilityLabel={b.label}
          >
            <Text
              className={`text-label font-medium ${
                selected ? "text-primary-700" : "text-neutral-600"
              }`}
            >
              {b.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// StakesSettings
// ---------------------------------------------------------------------------

/**
 * Stakes + wellbeing settings group (§8.11, §9.10). Warm, protective framing:
 * the caps are ceilings that keep the user safe, never a way to demand more of
 * them. Everything here writes through `useSettingsStore.updateSettings` and
 * the stakes store, no local-only state that could drift.
 *
 * Contents (§8.11: "daily lock cap and single-session cap, stake strength,
 * never-lock categories (view only)"):
 * - Daily lock cap, a protective ceiling on total lock minutes per day.
 *   User-lowerable, never user-raisable (FR-46), the stepper is bounded by
 *   `DAILY_LOCK_CAP_BOUNDS`, the same constant `normalizeSettings` clamps
 *   every write against.
 * - Single-session cap, the longest any one lock can last (this is also
 *   what converts a bad `until_done` estimate into a normal release, doc `04`
 *   §7). Bounded by `SINGLE_SESSION_CAP_BOUNDS`, same clamp relationship.
 * - Stake strength (FR-44), fixed sensible defaults plus this ONE user
 *   control. De-escalation (FR-43) can lower it automatically after repeated
 *   panic-valve use; this control lets the user raise it back deliberately,
 *   without disabling de-escalation itself, which stays free to act again
 *   later (`stakesStore.panicValve`, untouched by this screen).
 * - Quiet hours, the window where stakes always release (read-only preview
 *   here; no screen in the app currently exposes an editor for it, see
 *   `NotificationSettings.tsx`'s matching preview, which points back here).
 * - Never-lock apps, always reachable, shown fully VIEW ONLY per §8.11: no
 *   add/remove affordance on this screen. The six protected categories are
 *   re-asserted on every normalize (`store/migrations/settings.ts`) so they
 *   can never actually be removed regardless.
 * - Pause stakes for today, an always-available way to stand down.
 *
 * Designed to be embedded in a screen that provides its own scroll + padding.
 */
export function StakesSettings() {
  const dailyLockCapMin = useSettingsStore((s) => s.settings.dailyLockCapMin);
  const singleSessionCapMin = useSettingsStore(
    (s) => s.settings.singleSessionCapMin
  );
  const stakeStrength = useSettingsStore((s) => s.settings.stakeStrength);
  const quietHours = useSettingsStore((s) => s.settings.quietHours);
  const neverLockCategories = useSettingsStore(
    (s) => s.settings.neverLockCategories
  );
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const isPaused = useStakesStore((s) => s.isPaused());
  const pauseStakesForToday = useStakesStore((s) => s.pauseStakesForToday);
  const resumeStakes = useStakesStore((s) => s.resumeStakes);
  // De-escalation indicator (FR-43): true once repeated panic-valve use has
  // crossed the same threshold that already lowers `stakeStrength`
  // automatically (`stakesStore.panicValve`) and offers the pause sheet
  // elsewhere. Reusing that exact signal here means "strength was just
  // eased" and "offer a pause" always agree, they're the same event, read
  // read-only, never written from this screen.
  const recentlyDeEscalated = useStakesStore((s) => s.shouldOfferPause());
  // Apps chosen to be put on the line (for the "Choose apps" section copy).
  const stakeApps = useStakesStore((s) => s.apps);
  const stakeAppCount = stakeApps.filter((a) => a.eligible).length;
  const [appPickerOpen, setAppPickerOpen] = useState(false);

  const [protectedInfoOpen, setProtectedInfoOpen] = useState(false);

  const quietHoursLabel = useMemo(
    () => `${formatWindow(quietHours.start)} - ${formatWindow(quietHours.end)}`,
    [quietHours.start, quietHours.end]
  );

  const setCap = (next: number) => updateSettings({ dailyLockCapMin: next });
  const setSingleCap = (next: number) =>
    updateSettings({ singleSessionCapMin: next });

  const strengthBand = strengthBandOf(stakeStrength);
  /**
   * Write the picked band's anchor value. Raising strength back up after a
   * de-escalation is always allowed, this is the user's own commitment
   * device (FR-43), and doing so never disables de-escalation itself:
   * `stakesStore.panicValve` reads `settings.stakeStrength` fresh the next
   * time it fires and can lower it again regardless of what was picked here.
   * `AccessibilityInfo.announceForAccessibility` covers "announced changes"
   * for a value that only changes via a tap, with no focus move to re-read it.
   */
  const setStrength = (band: StrengthBand) => {
    Haptics.selectionAsync().catch(() => {});
    updateSettings({ stakeStrength: STRENGTH_BAND_VALUE[band] });
    const label = STRENGTH_BANDS.find((b) => b.key === band)?.label ?? band;
    AccessibilityInfo.announceForAccessibility(`Stake strength set to ${label}.`);
  };

  // Split the never-lock list into the 6 protected safety categories and any
  // extra entries added before this screen became view-only (§8.11). Both
  // groups render identically now (plain, non-removable rows), the split
  // only drives the "Protected" vs "Added earlier" sublabel below.
  const { protectedKeys, userKeys } = useMemo(() => {
    const p: string[] = [];
    const u: string[] = [];
    for (const key of neverLockCategories) {
      if (isProtectedCategory(key)) p.push(key);
      else u.push(key);
    }
    return { protectedKeys: p, userKeys: u };
  }, [neverLockCategories]);

  const togglePause = () => {
    if (isPaused) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      resumeStakes();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      pauseStakesForToday();
    }
  };

  return (
    <View>
      {/* Intro, set the protective tone before any control. */}
      <Text className="mb-4 text-body text-neutral-500">
        Stakes help you start. These limits keep them gentle, you are always in
        control, and nothing here can trap you.
      </Text>

      {/* Protective caps ---------------------------------------------------- */}
      <Text className="mb-2 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        Protective limits
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        <Row
          icon="shield-checkmark-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="Daily lock ceiling"
          sublabel="The most Ampora will ever lock in a day"
          trailing={
            <Stepper
              value={dailyLockCapMin}
              min={DAILY_LOCK_CAP_BOUNDS.min}
              max={DAILY_LOCK_CAP_BOUNDS.max}
              step={DAILY_CAP_STEP}
              onChange={setCap}
              a11yLabel="daily lock ceiling"
            />
          }
        />
        <Row
          icon="hourglass-outline"
          label="Longest single lock"
          sublabel="The hard ceiling on any one lock, a long until-done task simply releases here"
          trailing={
            <Stepper
              value={singleSessionCapMin}
              min={SINGLE_SESSION_CAP_BOUNDS.min}
              max={SINGLE_SESSION_CAP_BOUNDS.max}
              step={SINGLE_CAP_STEP}
              onChange={setSingleCap}
              a11yLabel="longest single lock"
            />
          }
          isLast
        />
      </View>

      {/* Stake strength (FR-44), fixed defaults plus this one control. ----- */}
      <Text className="mb-2 ml-1 mt-6 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        Stake strength
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white p-4"
        style={shadows.sm}
      >
        <Text className="text-body-lg text-neutral-900">
          How firm a lock holds you to it
        </Text>
        <Text className="mt-0.5 text-caption text-neutral-500">
          Fixed, sensible defaults per band, never a number to tune.
        </Text>
        <View className="mt-3">
          <StrengthPicker band={strengthBand} onSelect={setStrength} />
        </View>
        {recentlyDeEscalated ? (
          <Text
            className="mt-3 text-caption text-neutral-500"
            accessibilityLiveRegion="polite"
          >
            Eased after a few recent overrides, to take pressure off. Set it
            back whenever you&apos;re ready.
          </Text>
        ) : null}
      </View>

      {/* Quiet hours -------------------------------------------------------- */}
      <Text className="mb-2 ml-1 mt-6 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        Quiet hours
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        <Row
          icon="moon-outline"
          label="Stakes rest during"
          sublabel="Any active lock releases automatically in this window"
          trailing={
            <Text className="text-body font-medium text-neutral-500">
              {quietHoursLabel}
            </Text>
          }
          isLast
        />
      </View>

      {/* Apps on the line -------------------------------------------------- */}
      <Text className="mb-2 ml-1 mt-6 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        Apps on the line
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        <Pressable
          onPress={() => {
            setAppPickerOpen(true);
            Haptics.selectionAsync().catch(() => {});
          }}
          className="flex-row items-center py-3.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Choose which apps go on the line"
          accessibilityHint={
            stakeAppCount > 0
              ? `${stakeAppCount} apps chosen. Tap to change.`
              : "Tap to choose apps."
          }
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-50">
            <Ionicons name="apps-outline" size={18} color={colors.light.primary} />
          </View>
          <View className="ml-3 flex-1 pr-3">
            <Text className="text-body-lg text-neutral-900">Choose apps to lock</Text>
            <Text className="mt-0.5 text-caption text-neutral-500">
              {stakeAppCount > 0
                ? `${stakeAppCount} app${stakeAppCount === 1 ? "" : "s"} ready to put on the line`
                : "The leisure apps a stake can lock"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.light.textDisabled} />
        </Pressable>
      </View>
      <Text className="ml-1 mt-2 text-caption text-neutral-500">
        On iPhone you&apos;ll pick these with Apple&apos;s Screen Time picker once app
        locking is enabled.
      </Text>

      {/* Never-lock (protected) apps --------------------------------------- */}
      <View className="mb-2 ml-1 mt-6 flex-row items-center justify-between">
        <Text className="text-overline font-semibold uppercase tracking-wide text-neutral-500">
          Always reachable
        </Text>
        <Pressable
          onPress={() => setProtectedInfoOpen(true)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Why can't these be locked?"
        >
          <Ionicons name="information-circle-outline" size={18} color={colors.light.textMuted} />
        </Pressable>
      </View>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        {/* The 6 safety categories, always shown first, always Protected.
            View only throughout this section (§8.11): no add or remove
            control anywhere here, on purpose (see the file header). The six
            are re-asserted on every normalize regardless
            (`store/migrations/settings.ts#safeNeverLock`), so this UI change
            doesn't alter what's actually protected, only what the screen
            honestly presents as editable, which is nothing. */}
        {protectedKeys.map((key, i) => (
          <Row
            key={key}
            icon="lock-open-outline"
            iconTint={colors.light.successAccent}
            iconBg="bg-success-100"
            label={categoryLabel(key)}
            trailing={
              <View className="flex-row items-center">
                <Text className="mr-1 text-caption font-medium text-success-700">
                  Protected
                </Text>
                <Ionicons name="checkmark-circle" size={16} color={colors.light.successAccent} />
              </View>
            }
            isLast={userKeys.length === 0 && i === protectedKeys.length - 1}
          />
        ))}

        {/* Any entries added before this screen became view-only. Same
            treatment as the six above (plain, non-removable), only the
            sublabel differs, to be honest about provenance without implying
            a lesser or different protection than the mandatory six. */}
        {userKeys.map((key, i) => (
          <Row
            key={key}
            icon="lock-open-outline"
            iconTint={colors.light.textSecondary}
            iconBg="bg-neutral-100"
            label={categoryLabel(key)}
            sublabel="Added earlier"
            trailing={
              <View className="flex-row items-center">
                <Text className="mr-1 text-caption font-medium text-neutral-500">
                  Always reachable
                </Text>
                <Ionicons name="checkmark-circle" size={16} color={colors.light.textMuted} />
              </View>
            }
            isLast={i === userKeys.length - 1}
          />
        ))}
      </View>
      <Text className="ml-1 mt-2 text-caption text-neutral-500">
        These stay reachable no matter what, nothing here can be locked.
        This list isn&apos;t something you manage; Ampora keeps it protected
        automatically.
      </Text>

      {/* Pause for today ---------------------------------------------------- */}
      <Text className="mb-2 ml-1 mt-6 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        Take a break
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white p-4"
        style={shadows.sm}
      >
        {isPaused ? (
          <>
            <View className="mb-3 flex-row items-center">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-50">
                <Ionicons name="pause-circle-outline" size={18} color={colors.light.primary} />
              </View>
              <Text className="ml-3 flex-1 text-body text-neutral-600">
                Stakes are paused for the rest of today. Nothing will lock until
                tomorrow.
              </Text>
            </View>
            <Button
              title="Resume stakes"
              variant="secondary"
              size="lg"
              onPress={togglePause}
              accessibilityLabel="Resume stakes for the rest of today"
            />
          </>
        ) : (
          <>
            <Text className="mb-3 text-body text-neutral-600">
              Not today? Pause every stake until tomorrow. No streak lost, no
              questions asked.
            </Text>
            <Button
              title="Pause stakes for today"
              variant="secondary"
              size="lg"
              onPress={togglePause}
              accessibilityLabel="Pause all stakes for the rest of today"
            />
          </>
        )}
      </View>

      {/* Protected-apps explainer sheet ------------------------------------- */}
      <Modal
        visible={protectedInfoOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProtectedInfoOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setProtectedInfoOpen(false)}
        >
          <Pressable
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">Always reachable</Heading>
            <Text className="mt-2 text-body text-neutral-600">
              Phone, messages, maps, accessibility, system settings, and Ampora
              itself can never be locked. Focus should never get between you and
              the things that keep you safe or connected.
            </Text>
            <View className="mt-6">
              <Button
                title="Got it"
                variant="primaryBlue"
                size="lg"
                onPress={() => setProtectedInfoOpen(false)}
                accessibilityLabel="Close"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Leisure-app picker, "choose what's on the line". */}
      <AppPicker visible={appPickerOpen} onClose={() => setAppPickerOpen(false)} />
    </View>
  );
}

/** "23:00" style clock label for a minutes-from-midnight value. */
function formatWindow(minutesFromMidnight: number): string {
  const h = Math.floor(minutesFromMidnight / 60) % 24;
  const m = minutesFromMidnight % 60;
  const hh = String(h).padStart(2, "0");
  const mm = String(m).padStart(2, "0");
  return `${hh}:${mm}`;
}
