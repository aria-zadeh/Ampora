import { Tabs } from "expo-router";
import React from "react";
import { View } from "react-native";
import { TopSegmentedNav } from "@/components/ui/SegmentedTabBar";
import { TAB_ROUTES } from "@/constants/tabRoutes";

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      {/* In-flow top nav, not a floating bottom bar. It owns the top safe
          area, so the five tab screens below must not also reserve it
          (each drops its own `top` SafeAreaView edge). */}
      <TopSegmentedNav />
      <Tabs tabBar={() => null} screenOptions={{ headerShown: false }}>
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
    </View>
  );
}
