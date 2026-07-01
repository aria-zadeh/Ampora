import React from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ComingSoon } from "@/components/ComingSoon";

export default function FocusSessionScreen() {
  // taskId param is intentionally ignored while focus sessions are stubbed.
  return (
    <View className="flex-1 bg-neutral-100">
      {/* Close button header */}
      <SafeAreaView edges={["top"]} className="bg-neutral-100">
        <View className="flex-row items-center justify-end px-2 py-2">
          <Pressable
            onPress={() => router.back()}
            className="min-w-11 min-h-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
          >
            <Ionicons name="close" size={26} color="#18181B" />
          </Pressable>
        </View>
      </SafeAreaView>

      <View className="flex-1">
        <ComingSoon
          title="Focus session"
          subtitle="Coming soon."
          icon="timer-outline"
        />
      </View>
    </View>
  );
}
