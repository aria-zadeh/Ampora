import React from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { ComingSoon } from "@/components/ComingSoon";

export default function BusyTimesScreen() {
  return (
    <View className="flex-1 bg-neutral-100">
      {/* Back button header */}
      <SafeAreaView edges={["top"]} className="bg-neutral-100">
        <View className="flex-row items-center px-2 py-2">
          <Pressable
            onPress={() => router.back()}
            className="min-w-11 min-h-11 items-center justify-center"
            accessibilityRole="button"
            accessibilityLabel="Go back"
            hitSlop={8}
          >
            <Ionicons name="arrow-back" size={24} color="#1C1917" />
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
