import React, { useMemo, useState } from "react";
import { View, Text, Modal, Pressable, TextInput } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { Heading } from "@/components/ui/Heading";
import { Button } from "@/components/ui/Button";
import { AppPicker } from "@/components/stakes/AppPicker";
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

/**
 * The 6 safety categories that are ALWAYS reachable and can never be removed
 * (§9.10, doc 06 §4 — enforced client + server). User-added always-reachable
 * apps live alongside these but, unlike them, may be removed by the user.
 * Compared case-insensitively so a stray-cased persisted value still counts.
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
  // Apps chosen to be put on the line (for the "Choose apps" section copy).
  const stakeApps = useStakesStore((s) => s.apps);
  const stakeAppCount = stakeApps.filter((a) => a.eligible).length;
  const [appPickerOpen, setAppPickerOpen] = useState(false);

  const [protectedInfoOpen, setProtectedInfoOpen] = useState(false);
  // "+ Add always-reachable app" input sheet state.
  const [addOpen, setAddOpen] = useState(false);
  const [addText, setAddText] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const quietHoursLabel = useMemo(
    () => `${formatWindow(quietHours.start)} – ${formatWindow(quietHours.end)}`,
    [quietHours.start, quietHours.end]
  );

  const setCap = (next: number) => updateSettings({ dailyLockCapMin: next });

  // Split the never-lock list into the 6 protected safety categories (top,
  // immovable) and any user-added always-reachable apps (removable).
  const { protectedKeys, userKeys } = useMemo(() => {
    const p: string[] = [];
    const u: string[] = [];
    for (const key of neverLockCategories) {
      if (isProtectedCategory(key)) p.push(key);
      else u.push(key);
    }
    return { protectedKeys: p, userKeys: u };
  }, [neverLockCategories]);

  /** Append a user-named always-reachable app. Guards blanks + duplicates. */
  const addUserApp = () => {
    const name = addText.trim();
    if (!name) {
      setAddError("Type an app or category name.");
      return;
    }
    // Reject a duplicate (case-insensitive) of anything already on the list —
    // including the protected categories, so a user can't shadow "Phone".
    const dupe = neverLockCategories.some(
      (c) => c.trim().toLowerCase() === name.toLowerCase()
    );
    if (dupe) {
      setAddError("That's already always reachable.");
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateSettings({ neverLockCategories: [...neverLockCategories, name] });
    setAddText("");
    setAddError(null);
    setAddOpen(false);
  };

  /**
   * Remove a user-added always-reachable app. Hard-guarded: the 6 protected
   * safety categories can NEVER be removed here (defense in depth beyond the UI
   * only rendering the control for user rows).
   */
  const removeUserApp = (key: string) => {
    if (isProtectedCategory(key)) return; // never remove a safety category
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    updateSettings({
      neverLockCategories: neverLockCategories.filter((c) => c !== key),
    });
  };

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
            <Ionicons name="apps-outline" size={18} color="#2563EB" />
          </View>
          <View className="ml-3 flex-1 pr-3">
            <Text className="text-body-lg text-neutral-900">Choose apps to lock</Text>
            <Text className="mt-0.5 text-caption text-neutral-500">
              {stakeAppCount > 0
                ? `${stakeAppCount} app${stakeAppCount === 1 ? "" : "s"} ready to put on the line`
                : "The leisure apps a stake can lock"}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color="#A1A1AA" />
        </Pressable>
      </View>
      <Text className="ml-1 mt-2 text-caption text-neutral-400">
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
          <Ionicons name="information-circle-outline" size={18} color="#71717A" />
        </Pressable>
      </View>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        {/* The 6 safety categories — always shown first, always Protected. */}
        {protectedKeys.map((key) => (
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
          />
        ))}

        {/* User-added always-reachable apps — removable (protected ones aren't). */}
        {userKeys.map((key) => (
          <Row
            key={key}
            icon="lock-open-outline"
            iconTint="#52525B"
            iconBg="bg-neutral-100"
            label={categoryLabel(key)}
            sublabel="Added by you"
            trailing={
              <Pressable
                onPress={() => removeUserApp(key)}
                hitSlop={8}
                className="h-9 w-9 items-center justify-center rounded-full active:opacity-60"
                accessibilityRole="button"
                accessibilityLabel={`Remove ${categoryLabel(key)} from always reachable`}
              >
                <Ionicons name="close-circle" size={20} color="#A1A1AA" />
              </Pressable>
            }
          />
        ))}

        {/* + Add always-reachable app (always the last row). */}
        <Pressable
          onPress={() => {
            setAddText("");
            setAddError(null);
            setAddOpen(true);
            Haptics.selectionAsync().catch(() => {});
          }}
          className="flex-row items-center py-3.5 active:opacity-70"
          accessibilityRole="button"
          accessibilityLabel="Add an always-reachable app"
        >
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-50">
            <Ionicons name="add" size={20} color="#2563EB" />
          </View>
          <Text className="ml-3 flex-1 text-body-lg font-medium text-primary-600">
            Add always-reachable app
          </Text>
        </Pressable>
      </View>
      <Text className="ml-1 mt-2 text-caption text-neutral-400">
        The 6 safety apps stay open no matter what — they can't be locked or
        removed. Add your own always-reachable apps too, and remove those any
        time.
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

      {/* Add always-reachable app sheet ------------------------------------- */}
      <Modal
        visible={addOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddOpen(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setAddOpen(false)}
        >
          <Pressable
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">Add always-reachable app</Heading>
            <Text className="mt-2 text-body text-neutral-600">
              Name an app or category that should never be locked. It joins your
              always-reachable list — you can remove it any time.
            </Text>
            <TextInput
              value={addText}
              onChangeText={(t) => {
                setAddText(t);
                if (addError) setAddError(null);
              }}
              onSubmitEditing={addUserApp}
              placeholder="e.g. Banking, Health, Duolingo"
              placeholderTextColor="#A1A1AA"
              returnKeyType="done"
              autoFocus
              maxLength={40}
              className="mt-4 h-12 rounded-lg border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
              accessibilityLabel="App or category name"
            />
            {addError ? (
              <Text className="mt-2 text-caption font-medium text-warning-700">
                {addError}
              </Text>
            ) : null}
            <View className="mt-6 gap-2">
              <Button
                title="Add"
                variant="primaryBlue"
                size="lg"
                onPress={addUserApp}
                accessibilityLabel="Add this app to always reachable"
              />
              <Pressable
                onPress={() => setAddOpen(false)}
                className="items-center py-2.5"
                accessibilityRole="button"
                accessibilityLabel="Cancel"
              >
                <Text className="text-label font-medium text-neutral-500">Cancel</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Leisure-app picker — "choose what's on the line". */}
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
