import React, { useCallback } from "react";
import { Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Text } from "@/components/ui/Text";
import { useThemeColors } from "@/hooks/useThemeColors";
import { TAB_ROUTES, type TabRoute } from "@/constants/tabRoutes";

/**
 * The five-tab bottom bar, rebuilt to the measured source geometry.
 *
 * Every value below is [E], read out of the nine Figma PDF exports, where the
 * bar is identical on all nine screens:
 *
 *   bar        402 x 84, canvas fill, 1pt top border in `line` (#2D2D30)
 *   icons      ~20px, centred at 29 from the bar's top edge
 *   labels     11pt, baseline at 55 from the bar's top edge
 *   active     primary-light (#7CAEC4), icon and label together
 *   inactive   muted ink
 *
 * This replaces the in-flow TOP segmented control that shipped 2026-08-07.
 * The source screens put navigation at the bottom, so that is where it goes.
 *
 * The bar is IN FLOW, not floating: `app/(tabs)/_layout.tsx` gives routed
 * content `flex: 1` above it. Screens therefore reserve no clearance of their
 * own, which is why `useTopNavClearance()` is now a zero-returning shim.
 */

/** [E] measured bar height, excluding the device's bottom safe inset. */
export const BOTTOM_NAV_HEIGHT = 84;
/** [E] measured icon box. */
const ICON_SIZE = 20;

function isActive(pathname: string, route: TabRoute): boolean {
  if (route.name === "index") return pathname === "/" || pathname === "/index";
  return pathname.startsWith(`/${route.name}`);
}

function TabItem({ route, active }: { route: TabRoute; active: boolean }) {
  const theme = useThemeColors();
  const tint = active ? theme.primaryLight : theme.textMuted;

  const onPress = useCallback(() => {
    if (active) return;
    Haptics.selectionAsync().catch(() => {});
    router.replace(route.name === "index" ? "/" : (`/${route.name}` as never));
  }, [active, route.name]);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={route.accessibilityLabel}
      accessibilityState={{ selected: active }}
      // `accessibilityState` alone does NOT emit `aria-selected` on web -
      // verified in the running app, where every tab reported aria-selected
      // null and a screen reader could not tell which one was active. RN
      // supports the direct aria-* props, so both are passed: native reads
      // accessibilityState, web reads this.
      aria-selected={active}
      // The whole column is the target, so it clears 44x44 comfortably.
      className="flex-1 items-center justify-start pt-5 active:opacity-70"
    >
      <Ionicons
        name={active ? route.iconFocused : route.icon}
        size={ICON_SIZE}
        color={tint}
      />
      {/* `tiny` is the measured 11pt. Colour alone never carries the active
          state: the icon also switches to its filled variant. */}
      <Text
        variant="tiny"
        className="mt-1.5"
        style={{ color: tint }}
        numberOfLines={1}
      >
        {route.title}
      </Text>
    </Pressable>
  );
}

export function BottomTabBar() {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();

  return (
    <View
      className="flex-row border-t border-line bg-canvas"
      style={{ height: BOTTOM_NAV_HEIGHT + insets.bottom, paddingBottom: insets.bottom }}
      accessibilityRole="tablist"
    >
      {TAB_ROUTES.map((route) => (
        <TabItem key={route.name} route={route} active={isActive(pathname, route)} />
      ))}
    </View>
  );
}
