import React from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ComingSoon } from "@/components/ComingSoon";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function BusyTimesScreen() {
  // For the back arrow's Ionicons `color` only - it takes a literal, not a
  // `dark:` class, and `text` inverts between schemes.
  const theme = useThemeColors();
  return (
    <View className="flex-1 bg-neutral-100 dark:bg-neutral-950">
      {/* Back button header */}
      <SafeAreaView edges={["top"]} className="bg-neutral-100 dark:bg-neutral-950">
        <View className="flex-row items-center px-2 py-2">
          <Pressable
            onPress={() => router.back()}
            className="min-w-11 min-h-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={24} color={theme.text} />
          </Pressable>
        </View>
      </SafeAreaView>

      <View className="flex-1">
        <ComingSoon
          title="Busy times"
          subtitle="Set your busy times once scheduling is available."
          icon="time-outline"
        />
      </View>
    </View>
  );
}
