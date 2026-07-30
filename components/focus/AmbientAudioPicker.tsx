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
import { colors, iconSizes } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";

export interface AmbientAudioPickerProps {
  /** The currently selected ambient kind ("none" when silent). */
  current: FocusAudio;
  onPick: (kind: FocusAudio) => void;
}

export function AmbientAudioPicker({ current, onPick }: AmbientAudioPickerProps) {
  const reduceMotion = useReduceMotion();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <PressableScale
        onPress={() => setOpen((o) => !o)}
        haptic="selection"
        className="flex-row items-center justify-between px-4 h-12 rounded-xl bg-white border border-neutral-200"
        accessibilityRole="button"
        accessibilityLabel="Ambient sound"
        accessibilityState={{ expanded: open }}
      >
        <View className="flex-row items-center gap-2">
          <Ionicons
            name="musical-notes-outline"
            size={iconSizes.sm}
            color={colors.light.textSecondary}
          />
          <Text className="text-label font-medium text-neutral-700">Ambient sound</Text>
        </View>
        <View className="flex-row items-center gap-1">
          <Text className="text-caption text-neutral-500 capitalize">
            {current === "none" ? "Off" : current}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={iconSizes.sm}
            color={colors.light.textMuted}
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
                className={`flex-row items-center gap-1.5 px-3.5 h-10 rounded-full border ${
                  active ? "bg-primary-600 border-primary-600" : "bg-white border-neutral-200"
                }`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Ambient ${opt.label}`}
              >
                <Ionicons
                  name={opt.icon as keyof typeof Ionicons.glyphMap}
                  size={iconSizes.sm}
                  color={active ? colors.light.primaryForeground : colors.light.textSecondary}
                />
                <Text
                  className={`text-label font-medium ${active ? "text-white" : "text-neutral-700"}`}
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
