import React, { useState, useEffect, useMemo, useRef } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
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
import { trialDaysLeft, isActive } from "@/core/subscription";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS, SPRINGS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
] as const;

// ---------------------------------------------------------------------------
// Presentation primitives (screen-local)
// ---------------------------------------------------------------------------

/** Grouped white card with an overline header and soft shadow. */
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
      <Text className="mb-2 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
        {title}
      </Text>
      <View
        className="rounded-2xl border border-neutral-200 bg-white px-4"
        style={shadows.sm}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** A tappable settings row: leading icon, label, trailing value + chevron. */
function SettingsRow({
  icon,
  label,
  value,
  onPress,
  isLast = false,
  accessibilityLabel,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string | null;
  onPress: () => void;
  isLast?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      className={`flex-row items-center justify-between py-3.5 ${
        isLast ? "" : "border-b border-neutral-100"
      }`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View className="flex-1 flex-row items-center">
        <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
          <Ionicons name={icon} size={18} color="#57534E" />
        </View>
        <Text className="ml-3 text-body-lg text-neutral-900">{label}</Text>
      </View>
      <View className="flex-row items-center">
        {value ? (
          <Text
            className="mr-1.5 max-w-[140px] text-body text-neutral-500"
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        <Ionicons name="chevron-forward" size={18} color="#C4C4CC" />
      </View>
    </PressableScale>
  );
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

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
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Faint top wash behind the header */}
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 220,
        }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="pb-2 pt-6"
        >
          <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
            Your profile
          </Text>
          <Heading size="h1" className="mt-1">
            {displayName || "Welcome"}
          </Heading>
          {userEmail ? (
            <Text className="mt-1.5 text-body text-neutral-500">{userEmail}</Text>
          ) : null}

          {/* Subscription chip → paywall. Soft gate only (FR-88): a subtle
              status pill, never a block. */}
          <PressableScale
            onPress={() => router.push("/paywall")}
            haptic="light"
            className="mt-3 self-start"
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
                color={
                  subscriptionChip.tone === "active"
                    ? "#6D28D9"
                    : subscriptionChip.tone === "trial"
                      ? "#2563EB"
                      : "#C2410C"
                }
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
                color={
                  subscriptionChip.tone === "active"
                    ? "#6D28D9"
                    : subscriptionChip.tone === "trial"
                      ? "#2563EB"
                      : "#C2410C"
                }
                style={{ marginLeft: 2 }}
              />
            </Animated.View>
          </PressableScale>
        </Animated.View>

        {/* Appearance */}
        <SettingsGroup title="Appearance" index={1}>
          <View className="py-4">
            <View className="flex-row items-center gap-2 rounded-lg border border-neutral-200 bg-neutral-100 p-1">
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
                        isSelected ? "bg-white" : "bg-transparent"
                      }`}
                      style={isSelected ? shadows.xs : undefined}
                    >
                      <Ionicons
                        name={option.icon}
                        size={16}
                        color={isSelected ? "#2563EB" : "#6F6862"}
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
            icon="person-outline"
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
            icon="calendar-outline"
            label="Busy times"
            onPress={() => router.push("/settings/busy-times")}
            accessibilityLabel="Busy times"
          />
          <SettingsRow
            icon="options-outline"
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
          <Text className="mb-3 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
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
          <Text className="mb-3 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
            Calendar sync
          </Text>
          <CalendarSyncSettings />
        </Animated.View>

        {/* Account */}
        {userEmail && (
          <SettingsGroup title="Account" index={6}>
            <View className="flex-row items-center border-b border-neutral-100 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
                <Ionicons name="mail-outline" size={18} color="#57534E" />
              </View>
              <Text
                className="ml-3 flex-1 text-body-lg text-neutral-900"
                numberOfLines={1}
              >
                {userEmail}
              </Text>
            </View>
            <PressableScale
              onPress={() => signOut()}
              haptic="light"
              className="flex-row items-center py-3.5"
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <View className="h-9 w-9 items-center justify-center rounded-full bg-danger-100">
                <Ionicons name="log-out-outline" size={18} color="#DC2626" />
              </View>
              <Text className="ml-3 text-body-lg font-medium text-danger-600">
                Sign out
              </Text>
            </PressableScale>
          </SettingsGroup>
        )}
      </ScrollView>

      {/* Display name modal */}
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
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <Heading size="h3">Display name</Heading>
            <Text className="mt-1.5 text-body text-neutral-500">
              This is how Ampora greets you.
            </Text>
            <TextInput
              className="mt-5 min-h-12 rounded-md border border-neutral-200 bg-white px-4 text-body-lg text-neutral-900"
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="Your name"
              placeholderTextColor="#A8A29A"
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
