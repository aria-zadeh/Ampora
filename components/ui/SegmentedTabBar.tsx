import React, { useEffect, useState } from "react";
import { Pressable, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import {
  borderRadius,
  colors,
  iconSizes,
  motion,
  shadows,
} from "@/utils/design-tokens";
import { useReduceMotion } from "@/hooks/useReduceMotion";

/** Height of the visual pill track (excludes the outer safe-area/gap offset). */
export const TAB_BAR_TRACK_HEIGHT = 48;
/** Gap between the pill and the bottom safe-area edge. */
export const TAB_BAR_GAP = 8;

/**
 * Bottom padding a screen must reserve so its content clears the floating
 * pill tab bar. Feed this into a ScrollView/FlashList contentContainerStyle
 * paddingBottom (or similar) on any tab screen.
 */
export function useTabBarClearance(): number {
  const insets = useSafeAreaInsets();
  return insets.bottom + TAB_BAR_GAP + TAB_BAR_TRACK_HEIGHT + 12;
}

type IconName = keyof typeof Ionicons.glyphMap;

/** Icon pair per tab route. Order and names match app/(tabs)/_layout.tsx. */
function iconFor(routeName: string, focused: boolean): IconName {
  switch (routeName) {
    case "index":
      return focused ? "today" : "today-outline";
    case "calendar":
      return focused ? "calendar" : "calendar-outline";
    case "tasks":
      return focused ? "list" : "list-outline";
    case "focus":
      return focused ? "timer" : "timer-outline";
    case "profile":
      return focused ? "person" : "person-outline";
    default:
      return focused ? "ellipse" : "ellipse-outline";
  }
}

/**
 * Floating rounded-pill bottom tab bar. Replaces the default expo-router tab
 * bar chrome with five icon-only segments in one track, plus an animated
 * indicator that slides to the active segment.
 */
export function SegmentedTabBar(props: BottomTabBarProps) {
  const { state, descriptors, navigation, insets } = props;
  const reduceMotion = useReduceMotion();
  const [trackWidth, setTrackWidth] = useState(0);

  const segmentWidth =
    trackWidth > 0 ? (trackWidth - 4) / state.routes.length : 0;
  const translateX = useSharedValue(0);

  useEffect(() => {
    const target = state.index * segmentWidth;
    translateX.value = reduceMotion
      ? target
      : withSpring(target, motion.spring.tactile);
  }, [state.index, segmentWidth, reduceMotion, translateX]);

  const indicatorStyle = useAnimatedStyle(() => ({
    width: segmentWidth,
    opacity: trackWidth === 0 ? 0 : 1,
    transform: [{ translateX: translateX.value }],
  }));

  const handleTrackLayout = (event: LayoutChangeEvent) => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  return (
    <View
      style={{
        position: "absolute",
        left: 18,
        right: 18,
        bottom: insets.bottom + TAB_BAR_GAP,
        zIndex: 40,
      }}
    >
      <View
        onLayout={handleTrackLayout}
        style={[
          {
            flexDirection: "row",
            height: TAB_BAR_TRACK_HEIGHT,
            padding: 2,
            borderRadius: borderRadius.full,
            backgroundColor: colors.light.card,
            borderWidth: 1,
            borderColor: colors.light.border,
          },
          shadows.lg,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 2,
              left: 2,
              height: TAB_BAR_TRACK_HEIGHT - 4,
              borderRadius: borderRadius.full,
              backgroundColor: colors.light.primary,
            },
            indicatorStyle,
          ]}
        />
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const label =
            options.tabBarAccessibilityLabel ?? options.title ?? route.name;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              Haptics.selectionAsync().catch(() => {});
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({ type: "tabLongPress", target: route.key });
          };

          return (
            <Pressable
              key={route.key}
              onPress={onPress}
              onLongPress={onLongPress}
              hitSlop={{ top: 2, bottom: 2 }}
              accessibilityRole="tab"
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={label}
              style={{
                flex: 1,
                height: TAB_BAR_TRACK_HEIGHT - 4,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: borderRadius.full,
              }}
            >
              <Ionicons
                name={iconFor(route.name, isFocused)}
                size={iconSizes.lg}
                color={
                  isFocused
                    ? colors.light.primaryForeground
                    : colors.light.textMuted
                }
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
