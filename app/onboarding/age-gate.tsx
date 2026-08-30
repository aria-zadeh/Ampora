import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { Text } from "@/components/ui/Text";
import { DateTimePickerCrossPlatform } from "@/components/ui/DateTimePickerCrossPlatform";
import { useSettingsStore } from "@/store/settingsStore";
import { isAtLeast13 } from "@/core/entitlements";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { ProgressDots } from "./ProgressDots";

/**
 * Onboarding step 3, the age gate (PRD FR-87 addendum, App Store Guideline
 * 1.3, COPPA). Dot index 2 of 8, see the numbering note in `welcome.tsx`.
 *
 * A one-time date-of-birth check, placed before any task/list/project data
 * exists. Only the derived boolean (`Settings.ageVerified13Plus`) is ever
 * persisted, through `isAtLeast13` (`core/entitlements.ts`), tested there.
 * The birth date the user picks (`dob`, below) lives only in this
 * component's local state and is discarded the moment `handleContinue`
 * returns, it is never written to a store, MMKV, or synced anywhere.
 *
 * Under 13, this screen switches to a calm, non-shaming dead end and offers
 * no way to proceed into onboarding. Nothing here disables the platform's
 * own back gesture/hardware back, so a genuine mis-tap of the wrong birth
 * year is still correctable, but there is no in-app control that continues
 * forward from the blocked state.
 */
export default function AgeGateScreen() {
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();

  const [dob, setDob] = useState<Date>(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() - 16);
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [blocked, setBlocked] = useState(false);

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.delay(delay).duration(DURATIONS.base);

  const isFutureDate = dob.getTime() > Date.now();

  const handleContinue = () => {
    if (isFutureDate) return;
    if (!isAtLeast13(dob.getTime())) {
      setBlocked(true);
      return;
    }
    // Only the derived boolean is ever persisted, `dob` never leaves this
    // component (see the file docstring above).
    useSettingsStore.getState().updateSettings({ ageVerified13Plus: true });
    router.push("/onboarding/name");
  };

  if (blocked) {
    return (
      <View
        className="flex-1 items-center justify-center bg-neutral-100 px-8"
        style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
      >
        <Animated.View entering={enter(0)} className="items-center">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-neutral-200">
            <Ionicons name="time-outline" size={30} color={theme.textSecondary} />
          </View>
          <Heading size="h2" className="mt-5 text-center">
            Ampora is for ages 13 and up
          </Heading>
          <Text
            variant="bodyLg"
            className="mt-3 max-w-300 text-center text-neutral-600 leading-6"
          >
            That&apos;s a rule we follow closely, not a judgment on you. Come back
            and join us once you turn 13, we&apos;ll be here.
          </Text>
        </Animated.View>
      </View>
    );
  }

  return (
    <View
      className="flex-1 bg-neutral-100"
      style={{ paddingTop: insets.top, paddingBottom: insets.bottom + 24 }}
    >
      <View className="flex-1 justify-between px-6">
        <View className="mt-10">
          <Animated.View entering={enter(0)} className="mb-6">
            <ProgressDots total={8} current={2} />
          </Animated.View>
          <Animated.View entering={enter(0)}>
            <Text variant="overline" className="mb-3 text-neutral-500">
              One quick check
            </Text>
            <Heading size="h1" className="max-w-300">
              When&apos;s your birthday?
            </Heading>
            <Text variant="bodyLg" className="mt-3 max-w-xs leading-6 text-neutral-600">
              We only keep a yes or no, never the date.
            </Text>
          </Animated.View>

          <Animated.View entering={enter(90)} className="mt-10">
            <DateTimePickerCrossPlatform
              value={dob}
              onChange={setDob}
              mode="date"
              display="spinner"
              accessibilityLabel="Your date of birth"
            />
            {isFutureDate ? (
              <Text variant="caption" className="mt-2 text-danger-600">
                That date hasn&apos;t happened yet, double check it.
              </Text>
            ) : null}
          </Animated.View>
        </View>

        <Animated.View entering={enter(160)}>
          <Button
            title="Continue"
            variant="primaryBlue"
            size="lg"
            disabled={isFutureDate}
            onPress={handleContinue}
            accessibilityLabel="Save birthday and continue"
          />
        </Animated.View>
      </View>
    </View>
  );
}
