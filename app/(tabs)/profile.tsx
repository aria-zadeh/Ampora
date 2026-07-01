import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Pressable, Modal, TextInput } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useSettingsStore } from "@/store/settingsStore";
import { Button } from "@/components/ui/Button";
import { getCurrentUser, signOut } from "@/services/supabase";

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: "sunny-outline" },
  { value: "dark", label: "Dark", icon: "moon-outline" },
  { value: "system", label: "System", icon: "phone-portrait-outline" },
] as const;

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

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

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-8"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="pt-4 pb-4">
          <Text className="text-h1 font-bold text-neutral-900">Profile</Text>
          {displayName ? (
            <Text className="text-body text-neutral-500 mt-1">{displayName}</Text>
          ) : null}
        </View>

        {/* Appearance */}
        <View className="bg-white border border-neutral-200 rounded-lg shadow-sm p-4 mb-3">
          <Text className="text-caption font-semibold text-neutral-500 mb-3 uppercase tracking-wide">
            Appearance
          </Text>
          <View className="flex-row items-center gap-2">
            {THEME_OPTIONS.map((option) => {
              const isSelected = themePreference === option.value;
              return (
                <Pressable
                  key={option.value}
                  onPress={() => updateSettings({ themePreference: option.value })}
                  className={
                    isSelected
                      ? "flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-md min-h-[44px] bg-primary-600"
                      : "flex-1 flex-row items-center justify-center gap-1.5 py-3 rounded-md min-h-[44px] bg-neutral-100"
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  accessibilityLabel={`${option.label} theme${isSelected ? ", selected" : ""}`}
                >
                  <Ionicons
                    name={option.icon}
                    size={16}
                    color={isSelected ? "#FFFFFF" : "#52525B"}
                  />
                  <Text
                    className={
                      isSelected
                        ? "text-caption font-semibold text-white"
                        : "text-caption font-semibold text-neutral-600"
                    }
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Profile */}
        <View className="bg-white border border-neutral-200 rounded-lg shadow-sm p-4 mb-3">
          <Text className="text-caption font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
            Profile
          </Text>
          <Pressable
            onPress={openNameModal}
            className="flex-row items-center justify-between py-3"
            accessibilityRole="button"
            accessibilityLabel={`Display name: ${displayName || "not set"}`}
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name="person-outline" size={20} color="#52525B" />
              <Text className="text-body text-neutral-900 ml-3">Display name</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="text-caption text-neutral-400 mr-1">
                {displayName || "Set name"}
              </Text>
              <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
            </View>
          </Pressable>
        </View>

        {/* Scheduling */}
        <View className="bg-white border border-neutral-200 rounded-lg shadow-sm p-4 mb-3">
          <Text className="text-caption font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
            Scheduling
          </Text>
          <Pressable
            onPress={() => router.push("/settings/busy-times")}
            className="flex-row items-center justify-between py-3"
            accessibilityRole="button"
            accessibilityLabel="Busy times"
          >
            <View className="flex-row items-center flex-1">
              <Ionicons name="calendar-outline" size={20} color="#52525B" />
              <Text className="text-body text-neutral-900 ml-3">Busy times</Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color="#A1A1AA" />
          </Pressable>
        </View>

        {/* Account */}
        {userEmail && (
          <View className="bg-white border border-neutral-200 rounded-lg shadow-sm p-4 mb-3">
            <Text className="text-caption font-semibold text-neutral-500 mb-1 uppercase tracking-wide">
              Account
            </Text>
            <View className="flex-row items-center py-3 border-b border-neutral-200">
              <Ionicons name="mail-outline" size={20} color="#52525B" />
              <Text className="text-body text-neutral-900 ml-3">{userEmail}</Text>
            </View>
            <Pressable
              onPress={() => signOut()}
              className="flex-row items-center py-3 active:opacity-70"
              accessibilityRole="button"
              accessibilityLabel="Sign out"
            >
              <Ionicons name="log-out-outline" size={20} color="#DC2626" />
              <Text className="text-body text-danger-600 ml-3 font-medium">
                Sign out
              </Text>
            </Pressable>
          </View>
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
          className="flex-1 bg-black/40 justify-center items-center"
          onPress={() => setShowNameModal(false)}
        >
          <Pressable
            className="bg-white rounded-xl p-6 mx-8 w-[85%] max-w-[340px]"
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-h4 font-semibold text-neutral-900 mb-4">
              Display name
            </Text>
            <TextInput
              className="bg-white border border-neutral-200 rounded-md min-h-12 px-4 text-body-lg text-neutral-900 mb-4"
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
            <Button
              title="Save"
              variant="primary"
              onPress={saveName}
              accessibilityLabel="Save display name"
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
