import React from "react";
import { View, Text, Pressable, ScrollView } from "react-native";

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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-neutral-100 rounded-full"
      contentContainerClassName="p-1"
    >
      <View className="flex-row">
        {segments.map((segment) => {
          const active = segment.key === value;
          return (
            <Pressable
              key={segment.key}
              onPress={() => onChange(segment.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={segment.label}
              className={
                active
                  ? "bg-white rounded-full shadow-sm px-4 py-1.5"
                  : "bg-transparent rounded-full px-4 py-1.5"
              }
            >
              <Text
                className={
                  active
                    ? "text-label font-medium text-neutral-900"
                    : "text-label font-medium text-neutral-500"
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
