import React from "react";
import { View, Text, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { PressableScale } from "./PressableScale";
import { colors } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";

interface ChipProps {
  label: string;
  selected?: boolean;
  color?: string;
  onPress?: () => void;
  onRemove?: () => void;
}

export function Chip({
  label,
  selected = false,
  color,
  onPress,
  onRemove,
}: ChipProps) {
  const theme = useThemeColors();

  // SELECTED is a small pastel tint pair and takes no `dark:` variant: the
  // primary-100 fill is opaque and its primary-700 label is audited against
  // it at 5.49:1, so neither half moves when the page behind it does (doc 02
  // §14.6, and the same call `components/ui/Badge.tsx` makes for its five
  // semantic tones). UNSELECTED is pure neutral ramp, so it flips wholesale.
  // The fill takes the elevated step rather than the cheatsheet's canvas row
  // because chips land on the canvas (`bg-neutral-950`, the Tasks filter row)
  // and on a sheet (`bg-neutral-900`, the due-range picker) alike, and
  // neutral-800 stays visible on both where neutral-950 would vanish into
  // one. Label is the cheatsheet's textSecondary row, 6.00:1 on that fill.
  const containerClass = selected
    ? "flex-row items-center rounded-full px-3 py-1.5 bg-primary-100 border border-primary-200"
    : "flex-row items-center rounded-full px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800";
  const textClass = selected
    ? "text-caption font-medium text-primary-700"
    : "text-caption font-medium text-neutral-600 dark:text-neutral-400";

  const inner = (
    <>
      {/* Caller-supplied List/Tag identity colour, and deliberately NOT
          theme-resolved: `LIST_COLOR_SWATCHES` persists the chosen hex and
          every picker matches its selected ring against that stored value,
          so a swatch that moved with the colour scheme would stop matching
          previously saved lists. Decorative here (the label names the list),
          so it owes no ratio of its own. */}
      {color ? (
        <View
          className="w-2 h-2 rounded-full mr-1.5"
          style={{ backgroundColor: color }}
        />
      ) : null}
      <Text className={textClass}>{label}</Text>
      {onRemove ? (
        <Pressable
          onPress={onRemove}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          className="ml-1.5"
        >
          {/* Ionicons `color` takes a literal and cannot take a `dark:`
              class, so each branch resolves the tone the chip's own fill
              calls for. The two branches deliberately differ in KIND, not
              just value. Selected sits on the theme-invariant primary-100
              tint above, so its glyph has to be theme-invariant too, which
              is why this one reads `colors.light` outright instead of the
              active scheme: `colors.dark.primaryDark` is `#2563EB`, and
              swapping to it would repaint the glyph while the surface under
              it stayed put (5.49:1 becomes 4.24:1 for no reason). Unselected
              sits on the neutral fill that DOES flip, so it follows the
              scheme: textMuted measures 5.07:1 on the light chip and 3.16:1
              on the dark one, clear of the 3:1 bar a 14px glyph owes. */}
          <Ionicons
            name="close"
            size={14}
            color={selected ? colors.light.primaryDark : theme.textMuted}
          />
        </Pressable>
      ) : null}
    </>
  );

  // Interactive chip: press-scale + light haptic.
  if (onPress) {
    return (
      <PressableScale
        onPress={onPress}
        haptic="light"
        className={containerClass}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ selected }}
      >
        {inner}
      </PressableScale>
    );
  }

  // Static chip (display / remove-only).
  return (
    <View
      className={containerClass}
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      {inner}
    </View>
  );
}
