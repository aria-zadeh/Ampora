import React, { useState, useCallback } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeInDown } from "react-native-reanimated";
import { PressableScale } from "@/components/ui/PressableScale";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

interface MoreOptionsSectionProps {
  children: React.ReactNode;
  /** Collapsed by default per the editor spec. */
  defaultExpanded?: boolean;
}

/**
 * Collapsible "More options" disclosure. Starts collapsed; toggling reveals the
 * advanced scheduling fields the parent passes as children. Restyled as a clean
 * card row with a rotating chevron and a calm fade-in on expand.
 */
export function MoreOptionsSection({
  children,
  defaultExpanded = false,
}: MoreOptionsSectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const reduceMotion = useReduceMotion();

  const toggle = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setExpanded((v) => !v);
  }, []);

  return (
    <View>
      <PressableScale
        onPress={toggle}
        haptic={false}
        className="flex-row items-center justify-between rounded-lg border border-neutral-200 bg-white px-4 py-3.5"
        style={shadows.xs}
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        accessibilityLabel="More options"
      >
        <View className="flex-row items-center gap-2">
          <Ionicons name="options-outline" size={18} color="#52525B" />
          <Text className="text-body-lg font-semibold text-neutral-900">
            More options
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={18}
          color="#A1A1AA"
        />
      </PressableScale>

      {expanded ? (
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="mt-5 gap-5"
        >
          {children}
        </Animated.View>
      ) : null}
    </View>
  );
}
