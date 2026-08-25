import type { Ionicons } from "@expo/vector-icons";

type IconName = keyof typeof Ionicons.glyphMap;

export interface TabRoute {
  name: string;
  title: string;
  accessibilityLabel: string;
  icon: IconName;
  iconFocused: IconName;
}

/**
 * The five tabs, in PRD-fixed order (doc `01` §8.1): Today, Calendar, Tasks,
 * Focus, Profile. Single source of truth for both `app/(tabs)/_layout.tsx`'s
 * `Tabs.Screen` definitions and `SegmentedTabBar.tsx`'s `TopSegmentedNav`
 * rendering. Collapses what used to be a duplicated icon map between the two.
 *
 * Lives here, outside both, so neither has to import the other: `_layout.tsx`
 * renders `TopSegmentedNav` from `SegmentedTabBar.tsx`, and `SegmentedTabBar.tsx`
 * used to import `TAB_ROUTES` back from `_layout.tsx` — a circular import.
 */
export const TAB_ROUTES: TabRoute[] = [
  {
    name: "index",
    title: "Today",
    accessibilityLabel: "Today tab",
    icon: "today-outline",
    iconFocused: "today",
  },
  {
    name: "calendar",
    title: "Calendar",
    accessibilityLabel: "Calendar tab",
    icon: "calendar-outline",
    iconFocused: "calendar",
  },
  {
    name: "tasks",
    title: "Tasks",
    accessibilityLabel: "Tasks tab",
    icon: "list-outline",
    iconFocused: "list",
  },
  {
    name: "focus",
    title: "Focus",
    accessibilityLabel: "Focus tab",
    icon: "timer-outline",
    iconFocused: "timer",
  },
  {
    name: "profile",
    title: "Profile",
    accessibilityLabel: "Profile and settings tab",
    icon: "person-outline",
    iconFocused: "person",
  },
];
