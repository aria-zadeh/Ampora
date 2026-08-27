import { useColorScheme } from "nativewind";
import { colors, getListColors } from "@/utils/design-tokens";

/**
 * Resolves the ACTIVE color scheme's semantic token set — `colors.light` or
 * `colors.dark` from `utils/design-tokens.ts` — for call sites that need a
 * raw hex value rather than a Tailwind class: an Ionicons `color` prop, a
 * Reanimated `useAnimatedStyle` backgroundColor, `TextInput`'s
 * `placeholderTextColor`, and similar RN props that cannot take a class.
 *
 * className-driven styling should NOT need this hook at all any more. Since
 * the 2026-08-26 overhaul every colour class resolves through a CSS variable
 * (see global.css), so `bg-canvas` / `text-neutral-900` are already correct in
 * both themes with no `dark:` variant. This hook exists only for props that
 * take a literal value instead of a class.
 *
 * Always imports `useColorScheme` from "nativewind" (never "react-native" —
 * see CLAUDE.md). NativeWind resolves a "system" preference to the OS setting,
 * so `colorScheme` here is a concrete 'light' | 'dark'. It defaults to DARK
 * for the brief window before NativeWind's first read completes, matching the
 * app's dark-first default (`settingsStore.themePreference = 'dark'`) so there
 * is no light flash on launch.
 *
 * @example
 * const theme = useThemeColors();
 * <Ionicons name="moon" color={theme.textSecondary} />
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === "light" ? colors.light : colors.dark;
}

/**
 * The active scheme's categorical list/tag/project tints. Same contract as
 * `useThemeColors`, for the `listColors` set. Prefer this over importing
 * `listColors` directly, which is pinned to the dark set.
 */
export function useListColors() {
  const { colorScheme } = useColorScheme();
  return getListColors(colorScheme === "light" ? "light" : "dark");
}

/** The resolved scheme, dark-first. Useful for picking between asset variants. */
export function useResolvedScheme(): "light" | "dark" {
  const { colorScheme } = useColorScheme();
  return colorScheme === "light" ? "light" : "dark";
}
