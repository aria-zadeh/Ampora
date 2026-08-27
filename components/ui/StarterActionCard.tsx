import React from "react";
import { View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { FeatureShell } from "./FeatureShell";
import { PressableScale } from "./PressableScale";
import { PulseScale } from "./PulseScale";
import { Text } from "./Text";
import { colors, gradients } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useColorScheme } from "nativewind";
import type { StarterAction } from "@/types";

interface StarterActionCardProps {
  action: StarterAction;
  onToggle?: () => void;
}

/**
 * The signature focal card: the task's "First move". One of the app's ~4
 * `FeatureShell` uses (doc 02 §14.4) — the nested double-bezel gives it the
 * quiet weight of the single most important thing on Home. A subtle gradient
 * wash sits inside the shell's white inner surface (same wash technique as
 * `GradientCard`, hand-composed here so it clips to the shell's own radius
 * instead of stacking a second border/shadow on top of it); completing the
 * action gives a warm pulse (via PulseScale) + success haptic (via
 * PressableScale's success haptic).
 */
export function StarterActionCard({ action, onToggle }: StarterActionCardProps) {
  const done = action.done;
  // Ionicons `color` and LinearGradient `colors` take literal values and
  // cannot take a `dark:` class, so they resolve the active scheme here.
  // Everything className-driven below uses `dark:` variants directly.
  const theme = useThemeColors();
  const { colorScheme } = useColorScheme();

  return (
    // PulseScale pops once when `done` flips false -> true (completion feedback).
    <PulseScale trigger={done}>
      <FeatureShell>
        {/* `bg-white dark:bg-neutral-900` here is a deliberate paint-over,
            not a duplicate. `components/ui/FeatureShell.tsx` hardcodes its
            inner surface as `bg-white` and is outside this batch's editable
            set, so the shell would otherwise hand this card a white panel in
            dark mode. Restating white keeps light pixel-identical, and the
            shell's `rounded-xl` + `overflow-hidden` clips this fill to the
            same corners, so nothing about the geometry moves. The outer
            bezel is still FeatureShell's `bg-black/[0.02]` /
            `border-black/[0.06]`, which composites to roughly nothing on a
            near-black canvas — decorative, no ratio owed, but it does mean
            the double-bezel effect is a light-mode-only flourish until
            FeatureShell itself is converted. */}
        <View className="bg-white dark:bg-neutral-900">
          {/* Subtle top wash — decorative only, matches GradientCard's wash
              but clipped by the shell's own rounded-xl + overflow-hidden.

              Dark cannot reuse `gradients.firstMove`: it is primary-50
              (#EFF6FF) fading into white, i.e. a pale tint settling into the
              card surface, and both stops are near-white, so on a dark card
              it would render as a bright slab rather than a wash. There is
              no dark blue-tint token to swap in, and inventing one is a
              product decision rather than a mechanical translation, so dark
              keeps the same STRUCTURE built from `colors.dark`: the elevated
              step settling into the card step, one rung of the dark
              elevation ladder fading into the next. Composed inline from
              tokens the way `app/paywall.tsx` composes its own themed wash,
              never from a new hex. */}
          <LinearGradient
            colors={
              colorScheme === "dark"
                ? ([colors.dark.elevated, colors.dark.card] as const)
                : gradients.firstMove
            }
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            pointerEvents="none"
            style={{ position: "absolute", top: 0, left: 0, right: 0, height: "60%" }}
          />

          <View className="p-5">
            {/* Accent TEXT on a neutral surface, which is the case doc 02
                §1.8 carves out of the accents-stay-put rule: primary-600 is
                3.38:1 on the dark card, over the 3:1 glyph bar but under the
                4.5:1 this 11px line owes, so dark steps one lighter to
                primary-400 at 6.88:1. Same ramp, same blue-is-about-to-do
                meaning (§14.7), matching `components/ui/Button.tsx`'s
                `ghost` label. */}
            <Text variant="overline" className="text-primary-600 dark:text-primary-400">
              First move
            </Text>

            {/* Every colour override here needs its own `dark:` twin, and
                that is not belt-and-braces: `components/ui/Text.tsx` owns
                its ink as `text-neutral-900 dark:text-neutral-50`, and a
                bare `text-*` override is a single-class selector that loses
                to that `dark:` variant. Without the pair, the done state
                would silently render full-strength ink in dark mode instead
                of the de-emphasised tone.

                The done tone steps to textSecondary rather than mirroring
                textMuted, because this is 15px body copy, not the 13px
                caption tier the bespoke dark textMuted value is signed off
                for: neutral-400 is 6.91:1 on the dark card where textMuted
                would be 3.65:1, under the body bar. Same call, same
                reasoning, as `components/ui/EmptyState.tsx`'s subtitle. */}
            <Text
              variant="bodyMedium"
              className={`mt-1.5 ${
                done
                  ? "text-neutral-500 dark:text-neutral-400 line-through"
                  : "text-neutral-900 dark:text-neutral-50"
              }`}
              accessibilityLabel={`First move: ${action.text}${done ? ", done" : ""}`}
            >
              {action.text}
            </Text>

            {/* Mark done — success haptic on completion, light on undo. */}
            <PressableScale
              onPress={onToggle}
              haptic={done ? "light" : "success"}
              className={`mt-4 h-12 flex-row items-center justify-center rounded-md ${
                done ? "bg-success-100" : "bg-primary-600"
              }`}
              accessibilityRole="button"
              accessibilityState={{ checked: done }}
              accessibilityLabel={done ? "Mark first move not done" : "Mark first move done"}
            >
              {/* Both button states are self-contained OPAQUE fills, so
                  neither takes a `dark:` variant and neither glyph moves:
                  done is the audited success-100 tint with its success-700
                  label at 4.57:1 (doc 02 §14.6), not-done is the primary-600
                  fill with a white label at 5.17:1. `theme.successStrong`
                  and `theme.primaryForeground` are identical in both
                  schemes, so reading them through the scheme documents the
                  intent without moving a pixel.

                  The `dark:` twins on the two label classes ARE load-bearing
                  though, for the same reason as the action text above: a
                  bare `text-success-700` or `text-white` loses to
                  `components/ui/Text.tsx`'s own `dark:text-neutral-50`, so
                  in dark mode the label would jump to near-white — invisible
                  on the pale success tint, and a needless change of tone on
                  the blue fill. */}
              <View className="flex-row items-center">
                <Ionicons
                  name={done ? "checkmark-circle" : "ellipse-outline"}
                  size={18}
                  color={done ? theme.successStrong : theme.primaryForeground}
                />
                <Text
                  variant="label"
                  className={`ml-2 ${
                    done
                      ? "text-success-700 dark:text-success-700"
                      : "text-white dark:text-white"
                  }`}
                >
                  {done ? "Done" : "Start"}
                </Text>
              </View>
            </PressableScale>
          </View>
        </View>
      </FeatureShell>
    </PulseScale>
  );
}
