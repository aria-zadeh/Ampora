/**
 * AmbientAudioPicker — the session's optional ambient sound (PRD FR-62).
 *
 * A disclosure row plus a chip strip. Lifted out of `app/focus/session.tsx`
 * verbatim; the audio itself stays in `hooks/useFocusAudio`, which degrades to
 * silence rather than ever surfacing an error.
 */

import React, { useState } from "react";
import { View, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeIn } from "react-native-reanimated";

import { PressableScale } from "@/components/ui/PressableScale";
import { AUDIO_PICKER_OPTIONS, type FocusAudio } from "@/utils/audioConfig";
import { iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";

export interface AmbientAudioPickerProps {
  /** The currently selected ambient kind ("none" when silent). */
  current: FocusAudio;
  onPick: (kind: FocusAudio) => void;
}

export function AmbientAudioPicker({ current, onPick }: AmbientAudioPickerProps) {
  const reduceMotion = useReduceMotion();
  // Ionicons `color` takes a literal and cannot take a `dark:` class.
  const theme = useThemeColors();
  const [open, setOpen] = useState(false);

  return (
    <View>
      {/* `gap-3` and not `justify-between` alone: the session screen wraps this
          in `items-center` so the pill shrinks to its content, which leaves
          justify-between no free space to distribute and butts the label
          straight into the value ("Ambient soundOff"). The gap holds at any
          width. */}
      <PressableScale
        onPress={() => setOpen((o) => !o)}
        haptic="selection"
        className="flex-row items-center justify-between gap-3 px-4 h-12 rounded-xl bg-white border border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
        accessibilityRole="button"
        accessibilityLabel="Ambient sound"
        accessibilityState={{ expanded: open }}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="musical-notes-outline"
            size={iconSizes.sm}
            color={theme.textSecondary}
          />
          <Text className="text-label font-medium text-neutral-700 dark:text-neutral-300">Ambient sound</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-caption text-neutral-500 dark:text-[#78716C] capitalize">
            {current === "none" ? "Off" : current}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={iconSizes.sm}
            color={theme.textMuted}
          />
        </View>
      </PressableScale>

      {open && (
        <Animated.View
          entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.fast)}
          className="flex-row flex-wrap gap-2 mt-3"
        >
          {AUDIO_PICKER_OPTIONS.map((opt) => {
            const active = current === opt.kind;
            return (
              <PressableScale
                key={opt.kind}
                onPress={() => {
                  onPick(opt.kind);
                  setOpen(false);
                }}
                haptic={false}
                /* The SELECTED chip is a filled accent, so it keeps one value
                   in both themes and its white label stays at the audited
                   5.17:1 (doc 02 §14.1). Only the resting chip is an ordinary
                   card and flips per the cheatsheet. */
                className={`flex-row items-center gap-1.5 px-3.5 h-10 rounded-full border ${
                  active
                    ? "bg-primary-600 border-primary-600"
                    : "bg-white border-neutral-200 dark:bg-neutral-900 dark:border-neutral-800"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Ambient ${opt.label}`}
              >
                <Ionicons
                  name={opt.icon as keyof typeof Ionicons.glyphMap}
                  size={iconSizes.sm}
                  color={active ? theme.primaryForeground : theme.textSecondary}
                />
                <Text
                  className={`text-label font-medium ${active ? "text-white" : "text-neutral-700 dark:text-neutral-300"}`}
                >
                  {opt.label}
                </Text>
              </PressableScale>
            );
          })}
        </Animated.View>
      )}
    </View>
  );
}
