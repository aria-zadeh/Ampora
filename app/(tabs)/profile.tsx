import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSettingsStore } from "@/store/settingsStore";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { StakesSettings } from "@/components/settings/StakesSettings";
import { CalendarSyncSettings } from "@/components/settings/CalendarSyncSettings";
import { getCurrentUser, signOut } from "@/services/supabase";
import { flushBeforeSignOut } from "@/store/syncStore";
import { trialDaysLeft, isActive } from "@/core/subscription";
import { spacing } from "@/utils/design-tokens";
import { DURATIONS, SPRINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
] as const;

// ---------------------------------------------------------------------------
// Presentation primitives (screen-local)
// ---------------------------------------------------------------------------

/** Grouped card with an overline header. */
function SettingsGroup({
  title,
  index,
  children,
}: {
  title: string;
  index: number;
  children: React.ReactNode;
}) {
  const reduceMotion = useReduceMotion();
  return (
    <Animated.View
      entering={
        reduceMotion
          ? undefined
          : FadeInDown.delay(index * 45).duration(DURATIONS.base)
      }
      className="mt-6"
    >
      <Text className="mb-2 ml-1 text-overline font-semibold uppercase text-neutral-500">
        {title}
      </Text>
      <View className="rounded-xl border border-line bg-surface px-4">
        {children}
      </View>
    </Animated.View>
  );
}

/**
 * A tappable settings row: label, trailing value + chevron. No leading icon —
 * measured profile-settings rows put the label directly at the card's own
 * padding.
 */
function SettingsRow({
  label,
  value,
  onPress,
  isLast = false,
  accessibilityLabel,
}: {
  label: string;
  value?: string | null;
  onPress: () => void;
  isLast?: boolean;
  accessibilityLabel?: string;
}) {
  const theme = useThemeColors();
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      className={`flex-row items-center justify-between py-3.5 ${
        isLast ? "" : "border-b border-line"
      }`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text className="flex-1 text-body-lg text-neutral-900">{label}</Text>
      <View className="flex-row items-center">
        {value ? (
          <Text
            className="mr-1.5 max-w-36 text-body text-neutral-500"
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color={theme.textDisabled} />
      </View>
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();

  const displayName = useSettingsStore((s) => s.settings.displayName);
  const themePreference = useSettingsStore((s) => s.settings.themePreference);
  const subscription = useSettingsStore((s) => s.settings.subscription);
  const updateSettings = useSettingsStore((s) => s.updateSettings);

  // Subscription status → a subtle chip in the header (soft gate; core usage is
  // never blocked in this build). Derived, not stored, so it stays accurate.
  const subscriptionChip = useMemo(() => {
    if (subscription.status === "active") {
      return { label: "Ampora Plus", tone: "active" as const };
    }
    if (subscription.status === "trial") {
      const days = trialDaysLeft(subscription);
      if (isActive(subscription) && days > 0) {
        return {
          label: `Trial · ${days} ${days === 1 ? "day" : "days"} left`,
          tone: "trial" as const,
        };
      }
      return { label: "Trial ended", tone: "lapsed" as const };
    }
    return { label: "Choose a plan", tone: "lapsed" as const };
  }, [subscription]);

  // The chip's icon/chevron share one tone-derived color, matching the
  // `text-accent-700` / `text-primary-700` / `text-warning-700` classes used
  // for its label below (accent = active/Plus, primary = trial, warning =
  // lapsed) — same tone mapping, just resolved to a theme-aware literal for
  // the two Ionicons `color` props, which can't take a class.
  const chipIconColor =
    subscriptionChip.tone === "active"
      ? theme.accentStrong
      : subscriptionChip.tone === "trial"
        ? theme.primaryDark
        : theme.warningStrong;

  // Trial countdown chip tick — a quiet dip+settle whenever the chip's LABEL
  // changes (days-left counting down, or the status itself flipping), so the
  // count feels alive rather than a static text swap. Reduce-motion safe.
  const prevChipLabelRef = useRef(subscriptionChip.label);
  const chipScale = useSharedValue(1);
  const chipOpacity = useSharedValue(1);

  useEffect(() => {
    if (prevChipLabelRef.current === subscriptionChip.label) return;
    prevChipLabelRef.current = subscriptionChip.label;
    if (reduceMotion) return;

    chipOpacity.value = withSequence(
      withTiming(0.5, { duration: 90 }),
      withTiming(1, { duration: 140 }),
    );
    chipScale.value = withSequence(
      withTiming(0.94, { duration: 90 }),
      withSpring(1, SPRINGS.tactile),
    );
  }, [subscriptionChip.label, reduceMotion, chipOpacity, chipScale]);

  const chipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: chipOpacity.value,
    transform: [{ scale: chipScale.value }],
  }));

  const [showNameModal, setShowNameModal] = useState(false);
  const [nameDraft, setNameDraft] = useState(displayName ?? "");

  const [userEmail, setUserEmail] = useState<string | null>(null);
  useEffect(() => {
    getCurrentUser()
      .then((u) => setUserEmail(u?.email ?? null))
      .catch(() => {});
  }, []);

  const openNameModal = () => {
    setNameDraft(displayName ?? "");
    setShowNameModal(true);
  };

  const saveName = () => {
    updateSettings({ displayName: nameDraft.trim() || undefined });
    setShowNameModal(false);
  };

  const selectTheme = (value: (typeof THEME_OPTIONS)[number]["value"]) => {
    Haptics.selectionAsync().catch(() => {});
    updateSettings({ themePreference: value });
  };

  return (
    <View className="flex-1 bg-neutral-100">
      {/* Plain safe-area inset plus normal spacing. The nav lives in flow */}
      {/* above the screen now instead of floating over the bottom, so the */}
      {/* last row just needs to clear the device's own gesture bar. */}
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header — a centred identity block (measured profile-settings:
            circular avatar, name, one secondary line beneath it), followed
            by the grouped settings sections below. Ampora has no profile
            photo feature, so the avatar is a neutral fallback glyph rather
            than an uploaded image. The email that used to repeat here is
            dropped as a duplicate — it already has a permanent home in the
            Account group further down, visible in every state this line was. */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="items-center pb-2 pt-6"
        >
          <View
            className="h-19 w-19 items-center justify-center rounded-full bg-raised"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="person-outline" size={32} color={theme.textMuted} />
          </View>

          <Heading size="h2" className="mt-4 text-center">
            {displayName || "Welcome"}
          </Heading>

          {/* Subscription chip → paywall. Soft gate only (FR-88): a subtle
              status pill, never a block. Doubles as the identity block's
              centred secondary line. */}
          <PressableScale
            onPress={() => router.push("/paywall")}
            haptic="light"
            className="mt-2"
            accessibilityRole="button"
            accessibilityLabel={`${subscriptionChip.label}. Open subscription options`}
            accessibilityHint="Opens plans and your free trial"
          >
            <Animated.View
              style={chipAnimatedStyle}
              className={`flex-row items-center rounded-full px-3 py-1.5 ${
                subscriptionChip.tone === "active"
                  ? "bg-accent-100"
                  : subscriptionChip.tone === "trial"
                    ? "bg-primary-50"
                    : "bg-warning-100"
              }`}
            >
              <Ionicons
                name={
                  subscriptionChip.tone === "active"
                    ? "sparkles"
                    : subscriptionChip.tone === "trial"
                      ? "time-outline"
                      : "alert-circle-outline"
                }
                size={14}
                color={chipIconColor}
              />
              <Text
                className={`ml-1.5 text-caption font-semibold ${
                  subscriptionChip.tone === "active"
                    ? "text-accent-700"
                    : subscriptionChip.tone === "trial"
                      ? "text-primary-700"
                      : "text-warning-700"
                }`}
              >
                {subscriptionChip.label}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={13}
                color={chipIconColor}
                style={{ marginLeft: 2 }}
              />
            </Animated.View>
          </PressableScale>
        </Animated.View>

        {/* Appearance — the theme picker itself. Selecting an option writes
            `settings.themePreference`, which `app/_layout.tsx` mirrors into
            NativeWind's `setColorScheme` (including resolving "system"), so
            this control is what actually drives every themed class in the
            app, not just its own row. Dark-first: `themePreference` defaults
            to `'dark'`. */}
        <SettingsGroup title="Appearance" index={1}>
          <View className="py-4">
            <View className="flex-row items-center gap-2 rounded-lg border border-line bg-canvas p-1">
              {THEME_OPTIONS.map((option) => {
                const isSelected = themePreference === option.value;
                return (
                  <PressableScale
                    key={option.value}
                    onPress={() => selectTheme(option.value)}
                    haptic={false}
                    className="flex-1"
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    accessibilityLabel={`${option.label} theme${isSelected ? ", selected" : ""}`}
                  >
                    <View
                      className={`min-h-11 flex-row items-center justify-center gap-1.5 rounded-md py-2.5 ${
                        isSelected ? "bg-surface" : "bg-transparent"
                      }`}
                    >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={isSelected ? theme.primary : theme.textMuted}
                      />
                      <Text
                        className={
                          isSelected
                            ? "text-label font-semibold text-neutral-900"
                            : "text-label font-medium text-neutral-500"
                        }
                      >
                        {option.label}
                      </Text>
                    </View>
                  </PressableScale>
                );
              })}
            </View>
          </View>
        </SettingsGroup>

        {/* Profile */}
        <SettingsGroup title="Profile" index={2}>
          <SettingsRow
            label="Display name"
            value={displayName || "Set name"}
            onPress={openNameModal}
            isLast
            accessibilityLabel={`Display name: ${displayName || "not set"}`}
          />
        </SettingsGroup>

        {/* Scheduling */}
        <SettingsGroup title="Scheduling" index={3}>
          <SettingsRow
            label="Busy times"
            onPress={() => router.push("/settings/busy-times")}
            accessibilityLabel="Busy times"
          />
          <SettingsRow
            label="More settings"
            value="Scheduling, alerts, data"
            onPress={() => router.push("/settings/all")}
            isLast
            accessibilityLabel="More settings: scheduling defaults, notifications, and your data"
          />
        </SettingsGroup>

        {/* Focus stakes + wellbeing (§8.11). Embedded — StakesSettings renders
            its own grouped cards, so it sits under a section header rather than
            inside a SettingsGroup shell. */}
        <Animated.View
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.delay(4 * 45).duration(DURATIONS.base)
          }
          className="mt-6"
        >
          <Text className="mb-3 ml-1 text-overline font-semibold uppercase text-neutral-500">
            Focus stakes
          </Text>
          <StakesSettings />
        </Animated.View>

        {/* Calendar sync (§8.6, FR-1). Embedded — CalendarSyncSettings renders
            its own grouped card, so it sits under a section header rather than
            inside a SettingsGroup shell. */}
        <Animated.View
          entering={
            reduceMotion
              ? undefined
              : FadeInDown.delay(5 * 45).duration(DURATIONS.base)
          }
          className="mt-6"
        >
          <Text className="mb-3 ml-1 text-overline font-semibold uppercase text-neutral-500">
            Calendar sync
          </Text>
          <CalendarSyncSettings />
        </Animated.View>

        {/* Account */}
        {userEmail && (
          <SettingsGroup title="Account" index={6}>
            <View className="flex-row items-center border-b border-line py-3.5">
              <Text
                className="flex-1 text-body-lg text-neutral-900"
                numberOfLines={1}
              >
                {userEmail}
              </Text>
            </View>
            <PressableScale
              onPress={async () => {
                // Flush this device's not-yet-synced edits to THIS account
                // before ending the session, mirroring the handler in
                // `components/settings/DataSettings.tsx`. The `SIGNED_OUT`
                // listener in `app/_layout.tsx` clears local state either way,
                // so skipping the flush would not leak data across accounts,
                // but it would silently discard an edit made moments before
                // tapping this. `flushBeforeSignOut` is time-bounded, so a
                // slow or offline network cannot hang the button.
                await flushBeforeSignOut();
                await signOut();
              }}
              haptic="light"
              className="flex-row items-center py-3.5"
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Text className="flex-1 text-body-lg font-medium text-danger-600">
                Sign out
              </Text>
            </PressableScale>
          </SettingsGroup>
        )}
      </ScrollView>

      {/* Display name modal — a centered dialog (fades in and floats
          mid-screen, not bottom-anchored), so it gets the sheet surface +
          all-four-corner radius (contract §3b), and its field sits on the
          raised surface fields/rows inside a sheet use. */}
      <Modal
        visible={showNameModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowNameModal(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setShowNameModal(false)}
        >
          <Pressable
            className="w-full max-w-360 rounded-sheet bg-surface p-6"
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">Display name</Heading>
            <Text className="mt-1.5 text-body text-neutral-500">
              This is how Ampora greets you.
            </Text>
            <TextInput
              className="mt-5 min-h-12 rounded-lg bg-raised px-4 text-body-lg text-neutral-900"
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor={theme.textDisabled}
              autoFocus
              autoCapitalize="words"
              returnKeyType="done"
              onSubmitEditing={saveName}
              accessibilityLabel="Display name input"
            />
            <View className="mt-6">
              <Button
                title="Save"
                variant="primaryBlue"
                size="lg"
                onPress={saveName}
                accessibilityLabel="Save display name"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
