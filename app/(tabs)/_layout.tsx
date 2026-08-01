import { Tabs } from "expo-router";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { SegmentedTabBar } from "@/components/ui/SegmentedTabBar";

// Slightly larger, calmer tab icons. Kept here for parity with the custom
// tab bar's own icon map, even though SegmentedTabBar renders the icons.
const TAB_ICON_SIZE = 25;

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <SegmentedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}
    >
      {/* Order and labels are fixed by PRD §8.1: Today · Calendar · Tasks · Focus · Profile. */}
      <Tabs.Screen
        name="index"
        options={{
          title: "Today",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "today" : "today-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Today tab",
        }}
      />
      <Tabs.Screen
        name="calendar"
        options={{
          title: "Calendar",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "calendar" : "calendar-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Calendar tab",
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: "Tasks",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "list" : "list-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Tasks tab",
        }}
      />
      <Tabs.Screen
        name="focus"
        options={{
          title: "Focus",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "timer" : "timer-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Focus tab",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <Ionicons
              name={focused ? "person" : "person-outline"}
              size={TAB_ICON_SIZE}
              color={color}
            />
          ),
          tabBarAccessibilityLabel: "Profile and settings tab",
        }}
      />
    </Tabs>
  );
}
