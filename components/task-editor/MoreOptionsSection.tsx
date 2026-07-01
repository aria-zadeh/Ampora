import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";

interface MoreOptionsSectionProps {
  children: React.ReactNode;
  /** Collapsed by default per the editor spec. */
  defaultExpanded?: boolean;
}

/**
 * Collapsible "More options" disclosure. Starts collapsed; toggling reveals the
 * advanced scheduling fields the parent passes as children.
 */
export function MoreOptionsSection({
  children,
  defaultExpanded = false,
}: MoreOptionsSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <View>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        className="flex-row items-center justify-between py-2"
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="More options"
      >
        <Text className="text-body-lg font-semibold text-neutral-900">
          More options
        </Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color="#71717A"
        />
      </Pressable>

      {expanded ? <View className="mt-2 gap-5">{children}</View> : null}
    </View>
  );
}
