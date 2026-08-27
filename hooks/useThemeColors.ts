import { useColorScheme } from "nativewind";
import { colors } from "@/utils/design-tokens";

/**
 * Resolves the ACTIVE color scheme's semantic token set — `colors.light` or
 * `colors.dark` from `utils/design-tokens.ts` — for call sites that need a
 * raw hex value rather than a Tailwind class: an Ionicons `color` prop, a
 * Reanimated `useAnimatedStyle` backgroundColor, `TextInput`'s
 * `placeholderTextColor`, and similar RN props that cannot take a `dark:`
 * class.
 *
 * className-driven styling should keep using `dark:` variants directly on
 * the element and does NOT need this hook — it exists only for props that
 * take a literal value instead of a class.
 *
 * Always imports `useColorScheme` from "nativewind" (never "react-native" —
 * see CLAUDE.md). NativeWind already resolves a "system" preference to the
 * OS's actual light/dark setting, so `colorScheme` here is always a concrete
 * 'light' | 'dark', defaulting to 'light' for the brief window before
 * NativeWind's first read completes.
 *
 * @example
 * const theme = useThemeColors();
 * <Ionicons name="moon" color={theme.textSecondary} />
 */
export function useThemeColors() {
  const { colorScheme } = useColorScheme();
  return colorScheme === "dark" ? colors.dark : colors.light;
}
