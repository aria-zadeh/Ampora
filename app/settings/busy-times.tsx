import React from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ComingSoon } from "@/components/ComingSoon";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function BusyTimesScreen() {
  const theme = useThemeColors();
  return (
    <View className="flex-1 bg-neutral-100">
      {/* Back button header — matches the other secondary-screen headers
          (More settings, Legal). */}
      <SafeAreaView edges={["top"]} className="bg-neutral-100">
        <View className="flex-row items-center px-5 pb-2 pt-2">
          <Pressable
            onPress={() => router.back()}
            className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
            accessibilityRole="button"
            accessibilityLabel="Go back"
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
