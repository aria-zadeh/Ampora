import React, { useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { shadows, colors } from "@/utils/design-tokens";

interface Segment {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  segments: Segment[];
  value: string;
  onChange: (key: string) => void;
}

export function SegmentedControl({
  segments,
  value,
  onChange,
}: SegmentedControlProps) {
  const handleChange = useCallback(
    (key: string) => {
      if (key === value) return;
      Haptics.selectionAsync().catch(() => {});
      onChange(key);
    },
    [value, onChange],
  );

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-neutral-100 rounded-full self-start"
      contentContainerClassName="p-1"
    >
      <View className="flex-row gap-1">
        {segments.map((segment) => {
          const active = segment.key === value;
          return (
            <Pressable
              key={segment.key}
              onPress={() => handleChange(segment.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={segment.label}
              className="rounded-full px-4 py-1.5"
              style={active ? [{ backgroundColor: colors.light.card }, shadows.xs] : undefined}
            >
              <Text
                className={
                  active
                    ? "text-label font-medium text-neutral-900"
                    : "text-label text-neutral-500"
                }
              >
                {segment.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}
