import React, { useMemo, useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { PressableScale } from "@/components/ui/PressableScale";
import { useSettingsStore } from "@/store/settingsStore";
import type { SchedulingHours } from "@/types";
import { shadows, gradients } from "@/utils/design-tokens";
import { DURATIONS, SPRINGS, staggerDelay } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { ProgressDots } from "./ProgressDots";

/** Weekdays Mon-Fri as Date#getDay() indices (1 = Mon ... 5 = Fri). */
const WEEKDAYS = [1, 2, 3, 4, 5];

type PresetId = "afterSchool" | "evenings" | "custom";

interface Preset {
  id: PresetId;
  label: string;
  subtitle: string;
  icon: keyof typeof import("@expo/vector-icons").Ionicons.glyphMap;
  /** Hours (24h). Undefined for custom, which uses the stepper values. */
  start?: number;
  end?: number;
}

const PRESETS: Preset[] = [
  {
    id: "afterSchool",
    label: "After school",
    subtitle: "3:00pm – 9:00pm",
    icon: "school-outline",
    start: 15,
    end: 21,
  },
  {
    id: "evenings",
    label: "Evenings",
    subtitle: "6:00pm – 10:00pm",
    icon: "moon-outline",
    start: 18,
    end: 22,
  },
  {
    id: "custom",
    label: "Custom window",
    subtitle: "Pick your own hours",
    icon: "options-outline",
  },
];

/** Formats a 24h hour integer to a friendly clock label. */
function formatHour(hour: number): string {
  const h = ((hour + 11) % 12) + 1;
  const suffix = hour < 12 || hour === 24 ? "am" : "pm";
  const norm = hour === 24 ? 12 : h;
  return `${norm}:00${hour === 24 ? "am" : suffix}`;
}

export default function AvailabilityScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();

  const [selected, setSelected] = useState<PresetId>("afterSchool");
  const [customStart, setCustomStart] = useState(16); // 4pm
  const [customEnd, setCustomEnd] = useState(20); // 8pm

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  /** Resolve the active start/end hours from the chosen preset or custom steppers. */
  const { startHour, endHour } = useMemo(() => {
    if (selected === "custom") return { startHour: customStart, endHour: customEnd };
    const preset = PRESETS.find((p) => p.id === selected)!;
    return { startHour: preset.start!, endHour: preset.end! };
  }, [selected, customStart, customEnd]);

  const stepCustomStart = (dir: 1 | -1) => {
    setCustomStart((h) => {
      const next = Math.min(Math.max(h + dir, 0), customEnd - 1);
      return next;
    });
  };
  const stepCustomEnd = (dir: 1 | -1) => {
    setCustomEnd((h) => {
      const next = Math.min(Math.max(h + dir, customStart + 1), 24);
      return next;
    });
  };

  const handleContinue = () => {
    // Apply the chosen daily window to Mon-Fri (day 1-5), minutes-from-midnight.
    const schedulingHours: SchedulingHours = {
      perDay: WEEKDAYS.map((day) => ({
        day,
        windows: [{ start: startHour * 60, end: endHour * 60 }],
      })),
    };
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
      () => {},
    );
    useSettingsStore.getState().updateSettings({ schedulingHours });
    // Scheduling hours is step 4 of 7 (PRD §8.10), not the last step —
    // Notifications, the guided First task, and the aha moment still follow.
    // `onboardingComplete` is set at the very end of that chain, not here.
    router.push("/onboarding/notifications");
  };

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 16 }}
    >
      <LinearGradient
        colors={gradients.heroWash}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: "absolute", top: 0, left: 0, right: 0, height: 340 }}
      />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-6"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={enter(0)} className="mb-6">
          <ProgressDots total={7} current={3} />
        </Animated.View>
        <Animated.View entering={enter(0)}>
          <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-3">
            Your focus window
          </Text>
          <Heading size="h1" className="text-neutral-900 max-w-[320px]">
            When are you usually free to work?
          </Heading>
          <Text className="text-body-lg text-neutral-600 mt-3 leading-6 max-w-[330px]">
            Pick a typical weekday window. Ampora only plans tasks inside it —
            you can fine-tune any day later.
          </Text>
        </Animated.View>

        {/* Preset chips */}
        <View className="mt-8 gap-3">
          {PRESETS.map((preset, i) => {
            const isSelected = selected === preset.id;
            return (
              <Animated.View
                key={preset.id}
                entering={enter(100 + staggerDelay(i))}
              >
                <PresetCard
                  preset={preset}
                  isSelected={isSelected}
                  onPress={() => setSelected(preset.id)}
                />
              </Animated.View>
            );
          })}
        </View>

        {/* Custom stepper — only when Custom is chosen */}
        {selected === "custom" && (
          <Animated.View
            entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
            className="mt-4 bg-white border border-neutral-200 rounded-2xl p-5"
            style={shadows.sm}
          >
            <View className="flex-row items-center justify-between">
              <StepperColumn
                label="Start"
                value={formatHour(startHour)}
                onUp={() => stepCustomStart(1)}
                onDown={() => stepCustomStart(-1)}
                canUp={customStart < customEnd - 1}
                canDown={customStart > 0}
              />
              <View className="px-4">
                <Ionicons name="arrow-forward" size={20} color="#A8A29A" />
              </View>
              <StepperColumn
                label="End"
                value={formatHour(endHour)}
                onUp={() => stepCustomEnd(1)}
                onDown={() => stepCustomEnd(-1)}
                canUp={customEnd < 24}
                canDown={customEnd > customStart + 1}
              />
            </View>
          </Animated.View>
        )}

        {/* Summary line */}
        <Animated.View entering={enter(280)} className="mt-6">
          <Text className="text-caption text-neutral-500 leading-5">
            <Ionicons name="time-outline" size={13} color="#6F6862" /> We’ll plan
            your weekdays between{" "}
            <Text className="text-neutral-700 font-medium">
              {formatHour(startHour)}
            </Text>{" "}
            and{" "}
            <Text className="text-neutral-700 font-medium">
              {formatHour(endHour)}
            </Text>
            .
          </Text>
        </Animated.View>
      </ScrollView>

      <View className="px-6 pt-2">
        <Button
          title="Continue"
          variant="primaryBlue"
          size="lg"
          onPress={handleContinue}
          accessibilityLabel="Save focus window and continue"
        />
      </View>
    </View>
  );
}

interface PresetCardProps {
  preset: Preset;
  isSelected: boolean;
  onPress: () => void;
}

/**
 * Selectable preset row. On selection the card springs with a quick scale
 * pulse (SPRINGS.tactile) while the tint/border cross-fades — the same
 * "selected state springs" pattern used on the energy screen. Reduce-motion
 * drops the pulse but keeps the color swap.
 */
function PresetCard({ preset, isSelected, onPress }: PresetCardProps) {
  const reduceMotion = useReduceMotion();
  const scale = useSharedValue(1);

  const pulse = () => {
    if (reduceMotion) return;
    scale.value = withSpring(1.03, SPRINGS.tactile, () => {
      scale.value = withSpring(1, SPRINGS.tactile);
    });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: reduceMotion ? [] : [{ scale: scale.value }],
  }));

  return (
    <PressableScale
      haptic="selection"
      onPress={() => {
        onPress();
        pulse();
      }}
      accessibilityRole="radio"
      accessibilityState={{ selected: isSelected }}
      accessibilityLabel={`${preset.label}, ${preset.subtitle}`}
    >
      <Animated.View
        style={[isSelected ? undefined : shadows.sm, animatedStyle]}
        className={`flex-row items-center gap-4 rounded-2xl p-4 border ${
          isSelected
            ? "border-primary-500 bg-primary-50"
            : "border-neutral-200 bg-white"
        }`}
      >
        <View
          className={`w-11 h-11 rounded-full items-center justify-center ${
            isSelected ? "bg-primary-100" : "bg-neutral-100"
          }`}
        >
          <Ionicons
            name={preset.icon}
            size={22}
            color={isSelected ? "#2563EB" : "#6F6862"}
          />
        </View>
        <View className="flex-1">
          <Text
            className={`text-body-lg font-semibold ${
              isSelected ? "text-neutral-900" : "text-neutral-700"
            }`}
          >
            {preset.label}
          </Text>
          <Text className="text-caption text-neutral-500 mt-0.5">
            {preset.subtitle}
          </Text>
        </View>
        {isSelected && (
          <Ionicons name="checkmark-circle" size={24} color="#2563EB" />
        )}
      </Animated.View>
    </PressableScale>
  );
}

interface StepperColumnProps {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
}

function StepperColumn({
  label,
  value,
  onUp,
  onDown,
  canUp,
  canDown,
}: StepperColumnProps) {
  return (
    <View className="flex-1 items-center">
      <Text className="text-overline text-neutral-500 uppercase tracking-wide mb-2">
        {label}
      </Text>
      <View className="flex-row items-center gap-3">
        <PressableScale
          haptic="selection"
          onPress={onDown}
          disabled={!canDown}
          accessibilityLabel={`Decrease ${label.toLowerCase()} time`}
        >
          <View
            className={`w-9 h-9 rounded-full items-center justify-center border ${
              canDown ? "border-neutral-200 bg-white" : "border-neutral-100 bg-neutral-50"
            }`}
          >
            <Ionicons
              name="remove"
              size={18}
              color={canDown ? "#1C1917" : "#D7D3CC"}
            />
          </View>
        </PressableScale>
        <Text className="text-h4 font-semibold text-neutral-900 w-20 text-center">
          {value}
        </Text>
        <PressableScale
          haptic="selection"
          onPress={onUp}
          disabled={!canUp}
          accessibilityLabel={`Increase ${label.toLowerCase()} time`}
        >
          <View
            className={`w-9 h-9 rounded-full items-center justify-center border ${
              canUp ? "border-neutral-200 bg-white" : "border-neutral-100 bg-neutral-50"
            }`}
          >
            <Ionicons
              name="add"
              size={18}
              color={canUp ? "#1C1917" : "#D7D3CC"}
            />
          </View>
        </PressableScale>
      </View>
    </View>
  );
}
