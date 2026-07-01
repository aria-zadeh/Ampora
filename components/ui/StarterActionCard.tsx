import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { StarterAction } from "@/types";

interface StarterActionCardProps {
  action: StarterAction;
  onToggle?: () => void;
}

export function StarterActionCard({ action, onToggle }: StarterActionCardProps) {
  const done = action.done;

  return (
    <View
      className="bg-white border border-neutral-200 rounded-xl p-5 shadow-sm"
      accessibilityLabel={`First move: ${action.text}${done ? ", done" : ""}`}
    >
      {/* Overline */}
      <Text className="text-overline font-semibold text-primary-600 uppercase">
        First move
      </Text>

      {/* The action */}
      <Text
        className={`text-h4 font-semibold mt-1 ${
          done ? "line-through text-neutral-400" : "text-neutral-900"
        }`}
      >
        {action.text}
      </Text>

      {/* Mark done */}
      <Pressable
        onPress={onToggle}
        className={`mt-4 h-11 flex-row items-center justify-center rounded-md active:opacity-90 ${
          done ? "bg-success-100" : "bg-success-700"
        }`}
        accessibilityRole="button"
        accessibilityState={{ checked: done }}
        accessibilityLabel={done ? "Mark first move not done" : "Mark first move done"}
      >
        <Ionicons
          name={done ? "checkmark-circle" : "ellipse-outline"}
          size={18}
          color={done ? "#15803D" : "#FFFFFF"}
        />
        <Text
          className={`ml-2 text-label font-semibold ${
            done ? "text-success-700" : "text-white"
          }`}
        >
          {done ? "Done" : "Mark done"}
        </Text>
      </Pressable>
    </View>
  );
}
