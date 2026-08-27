import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import { Text } from "@/components/ui/Text";
import { borderRadius, iconSizes, motion } from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useThemeColors } from "@/hooks/useThemeColors";
import { TAB_ROUTES, type TabRoute } from "@/constants/tabRoutes";

/** Height of the visual pill track (a 44px segment row plus 2px padding each side). */
export const TOP_NAV_TRACK_HEIGHT = 48;
/** Gap above and below the track, inside the safe area. */
const TOP_NAV_GAP = 8;

/**
 * Vertical space something ELSE floating over routed content (currently only
 * `GlobalLockBanner`) must clear so it doesn't sit on top of the nav. The nav
 * itself is in flow now, not floating, so ordinary screens don't need this.
 */
export function useTopNavClearance(): number {
  const insets = useSafeAreaInsets();
  return insets.top + TOP_NAV_GAP + TOP_NAV_TRACK_HEIGHT + TOP_NAV_GAP;
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
  // The sliding indicator's `backgroundColor` lives in a Reanimated style
  // array and the tab glyphs are Ionicons `color`s — literal props, none of
  // which can take a `dark:` class, so they resolve the active scheme here.
  // The rest of this file is className-driven and uses `dark:` directly.
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
    // Both the safe-area strip and the track take the cheatsheet's canvas
    // row: this nav is in flow above the tab content, so it has to read as
    // part of the page, and the five screens under it are all
    // `bg-neutral-100 dark:bg-neutral-950`. The blue indicator is what
    // separates the active segment, not a track fill.
    <SafeAreaView edges={["top"]} className="bg-neutral-100 dark:bg-neutral-950">
      <View className="px-5 pt-2 pb-2">
        <View
          onLayout={handleTrackLayout}
          className="flex-row items-stretch bg-neutral-100 dark:bg-neutral-950 rounded-full p-0.5"
          style={{ minHeight: TOP_NAV_TRACK_HEIGHT }}
        >
          {/* A FILLED accent under a white glyph and label, so it keeps one
              value in both themes (doc 02 §14.1): the fill is opaque, which
              means white-on-primary stays 5.17:1 no matter what canvas is
              behind it. `theme.primary` resolves to the same primary-600
              step either way — read through the scheme rather than off
              `colors.light` so the intent is legible, not because the value
              moves. */}
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
                {/* Active rides the opaque blue fill, so it stays white in
                    both themes. Inactive sits straight on the canvas and
                    flips with it: textMuted is 4.44:1 on the light canvas
                    and 4.12:1 on the dark one, both well over the 3:1 a
                    24px glyph owes, and the label beside the active segment
                    is what actually names the state (status is never colour
                    alone, which is the deviation the block comment above
                    already calls out). */}
                <Ionicons
                  name={isActive ? route.iconFocused : route.icon}
                  size={iconSizes.lg}
                  color={isActive ? theme.primaryForeground : theme.textMuted}
                />
                {isActive && (
                  // `dark:text-white` is not redundant. `components/ui/Text.tsx`
                  // owns its ink as `text-neutral-900 dark:text-neutral-50`,
                  // and a bare `text-white` override is a single-class
                  // selector that loses to that `dark:` variant, so without
                  // the pair this label would silently render neutral-50 on
                  // the blue fill in dark mode (4.91:1) instead of white
                  // (5.17:1). Both clear AA, which is exactly why it would
                  // have gone unnoticed.
                  <Text
                    variant="label"
                    numberOfLines={1}
                    maxFontSizeMultiplier={1.2}
                    className="text-white dark:text-white"
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
