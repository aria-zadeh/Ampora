import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSettingsStore } from "@/store/settingsStore";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { getCurrentUser, signOut } from "@/services/supabase";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
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
          <Ionicons name={icon} size={18} color="#52525B" />
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
  const updateSettings = useSettingsStore((s) => s.updateSettings);

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
                        color={isSelected ? "#2563EB" : "#71717A"}
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
            isLast
            accessibilityLabel="Busy times"
          />
        </SettingsGroup>

        {/* Account */}
        {userEmail && (
          <SettingsGroup title="Account" index={4}>
            <View className="flex-row items-center border-b border-neutral-100 py-3.5">
              <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
                <Ionicons name="mail-outline" size={18} color="#52525B" />
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
              placeholderTextColor="#A1A1AA"
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
