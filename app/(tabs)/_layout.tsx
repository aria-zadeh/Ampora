import { Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "@/utils/design-tokens";

// Slightly larger, calmer tab icons. bg-white with a hairline border top
// border; active tint primary, inactive muted. Restrained — no glow.
const TAB_ICON_SIZE = 25;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.light.primary,
        tabBarInactiveTintColor: colors.light.textMuted,
        tabBarStyle: {
          backgroundColor: colors.light.card,
          borderTopColor: colors.light.border,
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 12,
          height: Platform.OS === "ios" ? 88 : 68,
          // Soft lift off the canvas — subtle, not a heavy shadow.
          shadowColor: colors.light.text,
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.03,
          shadowRadius: 8,
          elevation: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          letterSpacing: 0.1,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
        },
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
