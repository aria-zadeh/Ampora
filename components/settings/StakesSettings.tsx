import React, { useMemo, useState } from "react";
import { View, Text, Modal, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { PressableScale } from "@/components/ui/PressableScale";
import { useSettingsStore } from "@/store/settingsStore";
import { useStakesStore } from "@/store/stakesStore";
import { shadows } from "@/utils/design-tokens";

// ---------------------------------------------------------------------------
// Bounds + copy for the protective caps. Framed as ceilings that keep the
// user safe, never as punishment (§9.10 wellbeing stance).
// ---------------------------------------------------------------------------

/** Daily lock cap ceiling range (minutes). Default is 180 (3h). */
const CAP_MIN_MINUTES = 30;
const CAP_MAX_MINUTES = 480; // 8h — a generous hard ceiling.
const CAP_STEP = 30;

/** Human-friendly label for a never-lock category key. */
const CATEGORY_LABELS: Record<string, string> = {
  phone: "Phone & calls",
  messages: "Messages",
  maps: "Maps & navigation",
  accessibility: "Accessibility",
  os_settings: "System settings",
  ampora: "Ampora",
};

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
// Local presentation primitives
// ---------------------------------------------------------------------------

/** A row inside the group: leading icon bubble, label + optional sublabel, trailing slot. */
function Row({
  icon,
  iconTint = "#52525B",
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
        <Ionicons name="remove" size={18} color="#18181B" />
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
        <Ionicons name="add" size={18} color="#18181B" />
      </Pressable>
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
 * the stakes store — no local-only state that could drift.
 *
 * Contents:
 * - Daily lock cap — a protective ceiling on total lock minutes per day.
 * - Single-cooldown cap — the longest any one lock can last (a session can
 *   never lock past what remains of the daily cap; shown here so the user
 *   knows the worst case up front).
 * - Quiet hours — the window where stakes always release (read-only preview;
 *   editing lives in scheduling settings).
 * - Never-lock apps — always reachable, shown as protected and non-removable.
 * - Pause stakes for today — an always-available way to stand down.
 *
 * Designed to be embedded in a screen that provides its own scroll + padding.
 */
export function StakesSettings() {
  const dailyLockCapMin = useSettingsStore((s) => s.settings.dailyLockCapMin);
  const quietHours = useSettingsStore((s) => s.settings.quietHours);
  const neverLockCategories = useSettingsStore(
    (s) => s.settings.neverLockCategories
  );
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  const isPaused = useStakesStore((s) => s.isPaused());
  const pauseStakesForToday = useStakesStore((s) => s.pauseStakesForToday);
  const resumeStakes = useStakesStore((s) => s.resumeStakes);

  const [protectedInfoOpen, setProtectedInfoOpen] = useState(false);

  const quietHoursLabel = useMemo(
    () => `${formatWindow(quietHours.start)} – ${formatWindow(quietHours.end)}`,
    [quietHours.start, quietHours.end]
  );

  const setCap = (next: number) => updateSettings({ dailyLockCapMin: next });

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
      {/* Intro — set the protective tone before any control. */}
      <Text className="mb-4 text-body text-neutral-500">
        Stakes help you start. These limits keep them gentle — you are always in
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
          iconTint="#2563EB"
          iconBg="bg-primary-50"
          label="Daily lock ceiling"
          sublabel="The most Ampora will ever lock in a day"
          trailing={
            <Stepper
              value={dailyLockCapMin}
              min={CAP_MIN_MINUTES}
              max={CAP_MAX_MINUTES}
              step={CAP_STEP}
              onChange={setCap}
              a11yLabel="daily lock ceiling"
            />
          }
        />
        <Row
          icon="hourglass-outline"
          label="Longest single lock"
          sublabel="No one session locks past what is left of today's ceiling"
          trailing={
            <Text className="text-body-lg font-semibold text-neutral-500">
              {formatMinutes(dailyLockCapMin)}
            </Text>
          }
          isLast
        />
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
          <Ionicons name="information-circle-outline" size={18} color="#71717A" />
        </Pressable>
      </View>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        {neverLockCategories.map((key, i) => (
          <Row
            key={key}
            icon="lock-open-outline"
            iconTint="#16A34A"
            iconBg="bg-success-100"
            label={categoryLabel(key)}
            trailing={
              <View className="flex-row items-center">
                <Text className="mr-1 text-caption font-medium text-success-700">
                  Protected
                </Text>
                <Ionicons name="checkmark-circle" size={16} color="#16A34A" />
              </View>
            }
            isLast={i === neverLockCategories.length - 1}
          />
        ))}
      </View>
      <Text className="ml-1 mt-2 text-caption text-neutral-400">
        These stay open no matter what. They can't be locked and can't be
        removed.
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
                <Ionicons name="pause-circle-outline" size={18} color="#2563EB" />
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
