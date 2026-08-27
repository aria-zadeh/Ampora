import React, { useCallback } from "react";
import { View, Text, Pressable, ScrollView } from "react-native";
import * as Haptics from "expo-haptics";
import { shadows } from "@/utils/design-tokens";

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
    // The track deliberately takes the cheatsheet's CANVAS row, not a
    // surface row, in both themes. That is not an oversight carried over:
    // both call sites (`app/(tabs)/tasks.tsx`'s sort row and
    // `components/calendar/CalendarHeader.tsx`) sit on
    // `bg-neutral-100 dark:bg-neutral-950`, so the track is the same colour
    // as the page and reads as a floating pill rather than a boxed control.
    // Reproducing that in dark means matching the canvas step there too.
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="bg-neutral-100 dark:bg-neutral-950 rounded-full self-start"
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
              // The active fill moved from a `colors.light.card` style
              // literal onto classes so it can carry a `dark:` variant at
              // all, and the dark step is `elevated`, not `card`, on
              // purpose. The elevation ladder is not symmetric between the
              // themes: light runs canvas #F7F6F3 -> elevated #FAF9F7 ->
              // card #FFFFFF, so the MOST raised surface is `card`, while
              // dark runs canvas #0C0A09 -> card #1C1917 -> elevated
              // #292524, so the most raised surface is `elevated`. Taking
              // `card` in dark would put the pill on the middle rung and
              // leave it at 1.13:1 against the track; `elevated` is 1.30:1.
              // Both are faint by design — light's white-on-canvas pill is
              // only 1.08:1 and leans on `shadows.xs`, which composites to
              // nothing on a near-black canvas — so the selected state is
              // never carried by fill alone: the label also changes tone and
              // weight, and `accessibilityState.selected` is set below.
              className={`rounded-full px-4 py-1.5 ${active ? "bg-white dark:bg-neutral-800" : ""}`}
              style={active ? shadows.xs : undefined}
            >
              {/* Inactive is 14px, which is neither large text nor the 13px
                  caption tier the bespoke dark textMuted value is audited
                  for, so it owes the full 4.5:1 and dark steps up one to
                  textSecondary: neutral-400 is 7.81:1 on the dark canvas
                  where textMuted would be 4.12:1. Light is untouched at
                  neutral-500, 5.07:1 on the light canvas. Active is the
                  cheatsheet's ink row, 14.42:1 on the dark pill. */}
              <Text
                className={
                  active
                    ? "text-label font-medium text-neutral-900 dark:text-neutral-50"
                    : "text-label text-neutral-500 dark:text-neutral-400"
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
