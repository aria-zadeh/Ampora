import React from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { EmptyState } from "@/components/ui/EmptyState";

interface ComingSoonProps {
  title: string;
  subtitle: string;
  icon?: keyof typeof Ionicons.glyphMap;
}

export function ComingSoon({ title, subtitle, icon }: ComingSoonProps) {
  return (
    <SafeAreaView className="flex-1 bg-neutral-100">
      <View className="flex-1 items-center justify-center">
        <EmptyState title={title} subtitle={subtitle} icon={icon} />
      </View>
    </SafeAreaView>
  );
}
