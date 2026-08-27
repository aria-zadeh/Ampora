import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useThemeColors } from "@/hooks/useThemeColors";
import { BottomTabBar } from "@/components/ui/BottomTabBar";
import { TAB_ROUTES } from "@/constants/tabRoutes";

/**
 * Navigation sits at the BOTTOM, matching the source screens, where an
 * identical 402x84 bar appears on all nine.
 *
 * The bar is in flow rather than floating, so routed content simply takes the
 * remaining height and no screen has to reserve clearance for it. The top safe
 * area is owned here too, which is why the five tab screens each drop their own
 * `top` SafeAreaView edge.
 */
export default function TabLayout() {
  const theme = useThemeColors();

  return (
    <View style={{ flex: 1 }} className="bg-canvas">
      <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
        {/* Same reason as the root Stack: the default scene background is a
            light grey that would flash on every tab switch. */}
        <Tabs
          tabBar={() => null}
          screenOptions={{
            headerShown: false,
            sceneStyle: { backgroundColor: theme.background },
          }}
        >
          {TAB_ROUTES.map((route) => (
            <Tabs.Screen
              key={route.name}
              name={route.name}
              options={{
                title: route.title,
                tabBarAccessibilityLabel: route.accessibilityLabel,
              }}
            />
          ))}
        </Tabs>
      </SafeAreaView>
      <BottomTabBar />
    </View>
  );
}
