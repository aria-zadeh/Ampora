import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Text } from "@/components/ui/Text";
import { borderRadius, iconSizes, motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { TAB_ROUTES, type TabRoute } from "@/constants/tabRoutes";

/** Height of the visual pill track (a 44px segment row plus 2px padding each side). */
export const TOP_NAV_TRACK_HEIGHT = 48;

/**
 * DEPRECATED shim, retained so existing call sites keep compiling.
 *
 * Navigation moved to the BOTTOM on 2026-08-26 to match the source screens,
 * and the bar is in flow rather than floating (see `BottomTabBar.tsx`), so
 * nothing needs to reserve vertical clearance for it any more. Returns 0.
 *
 * Remove this and its call sites once every screen has been checked.
 */
export function useTopNavClearance(): number {
  return 0;
}

/** The active segment gets extra room for its label. Inactive ones stay square-ish. */
const ACTIVE_FLEX = 2;
const INACTIVE_FLEX = 1;
/** Sum of all five segments' flex weights (one active + four inactive) — the
 *  denominator for the indicator's analytic width/position math below. */
const TOTAL_FLEX = ACTIVE_FLEX + (TAB_ROUTES.length - 1) * INACTIVE_FLEX;
/**
 * The track's own padding (`p-0.5`, 2px). RN positions absolutely-positioned
 * children (like the sliding indicator below) relative to the parent's
 * BORDER box, ignoring padding — unlike in-flow children (the segments),
 * which the padding DOES shift inward. `top`/`bottom` on the indicator
 * already correct for this on the vertical axis; this constant does the same
 * job horizontally, folded into the indicator's translateX math below (this
 * is what the reported ~2px horizontal drift traced back to).
 */
const TRACK_PADDING = 2;

/** First path segment, e.g. "/calendar" -> "calendar", "/" -> "index". */
function routeNameFromPathname(pathname: string): string {
  const first = pathname.split("/").filter(Boolean)[0];
  return first ?? "index";
}

/** Static href per tab route. Matches the five `(tabs)` group screens exactly. */
function hrefForRouteName(name: string): "/" | "/calendar" | "/tasks" | "/focus" | "/profile" {
  switch (name) {
    case "calendar":
      return "/calendar";
    case "tasks":
      return "/tasks";
    case "focus":
      return "/focus";
    case "profile":
      return "/profile";
    default:
      return "/";
  }
}

/**
 * In-flow top segmented nav. Replaces the old floating bottom pill
 * (`docs/design/stack-reference.html` `.sf-segnav`) with the same five
 * routes, now anchored above the tab content instead of floating over it.
 *
 * Deviation from the reference, deliberate: the reference marks the active
 * segment by blue fill alone. Status by colour alone is forbidden (doc 02),
 * so the active segment also shows its text label next to its icon, and gets
 * extra flex so the label has room. Inactive segments stay icon-only.
 */
export function TopSegmentedNav() {
  const pathname = usePathname();
  const reduceMotion = useReduceMotion();
  const theme = useThemeColors();

  const activeIndex = useMemo(() => {
    const name = routeNameFromPathname(pathname);
    const idx = TAB_ROUTES.findIndex((route) => route.name === name);
    return idx >= 0 ? idx : 0;
  }, [pathname]);

  // The track's own content width (its rendered width minus its own
  // padding) is the one measurement the indicator's geometry needs.
  // Switching the active segment changes two segments' individual
  // flex-basis but never the track's own width, so this stays correct
  // across every tab switch — unlike measuring the active segment directly,
  // which would momentarily read its STALE (inactive-flex) size until its
  // own onLayout caught up, springing toward the wrong target and then
  // correcting a frame later (the reported double-animation).
  const [trackContentWidth, setTrackContentWidth] = useState(0);
  const measuredOnce = useRef(false);

  const handleTrackLayout = useCallback((e: LayoutChangeEvent) => {
    const width = Math.max(0, e.nativeEvent.layout.width - TRACK_PADDING * 2);
    setTrackContentWidth((prev) => (prev === width ? prev : width));
  }, []);

  const indicatorX = useSharedValue(0);
  const indicatorWidth = useSharedValue(0);

  useEffect(() => {
    if (trackContentWidth <= 0) return;
    // Every segment shares the same flex weight except the active one, so
    // its x/width follow directly from the active index and the track
    // width — no per-segment measurement, and no race between them.
    const unit = trackContentWidth / TOTAL_FLEX;
    const targetX = TRACK_PADDING + activeIndex * INACTIVE_FLEX * unit;
    const targetWidth = ACTIVE_FLEX * unit;
    if (!measuredOnce.current || reduceMotion) {
      // First real measurement (or reduce-motion): snap, don't grow in from nothing.
      indicatorX.value = targetX;
      indicatorWidth.value = targetWidth;
      measuredOnce.current = true;
    } else {
      indicatorX.value = withSpring(targetX, motion.spring.tactile);
      indicatorWidth.value = withSpring(targetWidth, motion.spring.tactile);
    }
  }, [activeIndex, trackContentWidth, reduceMotion, indicatorX, indicatorWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: indicatorWidth.value,
    opacity: indicatorWidth.value === 0 ? 0 : 1,
    transform: [{ translateX: indicatorX.value }],
  }));

  const handlePress = useCallback(
    (route: TabRoute, index: number) => {
      if (index === activeIndex) return;
      Haptics.selectionAsync().catch(() => {});
      router.navigate(hrefForRouteName(route.name));
    },
    [activeIndex],
  );

  return (
    // The safe-area strip intentionally matches the page (bg-canvas) — it's
    // not its own bar, just clearance above one. The pill below is the bar.
    <SafeAreaView edges={["top"]} className="bg-canvas">
      <View className="px-5 pt-2 pb-2">
        {/*
          Was bg-neutral-100 — that role IS canvas (role-mapped, not
          lightness-mapped), which made the app's persistent top nav
          invisible against the page it sits on. bg-raised + a border gives
          it a real, visible track in both themes.
        */}
        <View
          onLayout={handleTrackLayout}
          className="flex-row items-stretch bg-raised border border-line rounded-full p-0.5"
          style={{ minHeight: TOP_NAV_TRACK_HEIGHT }}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                top: TRACK_PADDING,
                bottom: TRACK_PADDING,
                borderRadius: borderRadius.full,
                backgroundColor: theme.primary,
              },
              indicatorStyle,
            ]}
          />
          {TAB_ROUTES.map((route, index) => {
            const isActive = index === activeIndex;
            return (
              <Pressable
                key={route.name}
                onPress={() => handlePress(route, index)}
                hitSlop={{ top: 2, bottom: 2 }}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={route.accessibilityLabel}
                className="min-h-11 flex-row items-center justify-center gap-1.5"
                style={{ flex: isActive ? ACTIVE_FLEX : INACTIVE_FLEX }}
              >
                <Ionicons
                  name={isActive ? route.iconFocused : route.icon}
                  size={iconSizes.lg}
                  color={isActive ? theme.primaryForeground : theme.textMuted}
                />
                {isActive && (
                  <Text
                    variant="label"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    // Was text-white: `white` is remapped to the card
                    // surface, not a literal white, so this was coincidentally
                    // close to (but not actually) the correct token.
                    // text-primary-foreground is the real one.
                    className="text-primary-foreground"
                  >
                    {route.title}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}
