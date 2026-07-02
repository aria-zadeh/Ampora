/**
 * AppPicker — Ampora Phase 5 Ignition (FR-40, PRD §8.8 / §9.4 StakeApp).
 *
 * An Opal-style "choose what's on the line" sheet: a premium, multi-select list
 * of common leisure apps the user opts to put behind their task. Selections are
 * written to the stakes store as `StakeApp[]` via `setApps(...)`, so the rest of
 * Ignition (LockBanner copy, the future native shield) reads one source of truth.
 *
 * Platform reality (§8.8, doc 06): on iPhone the REAL blocked-app set is chosen
 * with Apple's own Screen Time picker (FamilyActivityPicker) once the Family
 * Controls entitlement is enabled — Ampora never sees app identities, only
 * opaque tokens. On web/dev there is no system picker, so we show a curated mock
 * catalog of well-known leisure apps as a faithful stand-in. The copy says so
 * plainly, so nothing here over-promises OS-level blocking.
 *
 * Wellbeing (§9.10): only LEISURE apps appear here. The never-lock safety
 * categories (phone, messages, maps, accessibility, system settings, Ampora)
 * are not in this catalog and can never be put on the line.
 *
 * RN + NativeWind, web-export safe. No native module imported. Reuses the
 * design system (Heading, Button, PressableScale) and tokens.
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, Modal, Pressable, ScrollView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";

import { Button } from "@/components/ui/Button";
import { Heading } from "@/components/ui/Heading";
import { shadows } from "@/utils/design-tokens";
import { DURATIONS } from "@/utils/motion";
import { useReduceMotion } from "@/hooks/useReduceMotion";
import { useStakesStore } from "@/store/stakesStore";
import type { StakeApp } from "@/types";

// ---------------------------------------------------------------------------
// Curated catalog of common leisure apps (web/dev stand-in for the system
// picker). `key` is a stable identity used to reconcile against already-chosen
// StakeApps so toggles persist across re-opens; `token` mocks the opaque
// package/token the platform would supply. Icons/tints are for presentation.
// ---------------------------------------------------------------------------

interface CatalogApp {
  key: string;
  label: string;
  token: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  tintBg: string;
}

const CATALOG: CatalogApp[] = [
  { key: "instagram", label: "Instagram", token: "com.burbn.instagram", icon: "logo-instagram", tint: "#C13584", tintBg: "bg-accent-100" },
  { key: "tiktok", label: "TikTok", token: "com.zhiliaoapp.musically", icon: "musical-notes", tint: "#1C1917", tintBg: "bg-neutral-100" },
  { key: "youtube", label: "YouTube", token: "com.google.ios.youtube", icon: "logo-youtube", tint: "#DC2626", tintBg: "bg-danger-100" },
  { key: "x", label: "X (Twitter)", token: "com.atebits.Tweetie2", icon: "logo-twitter", tint: "#1C1917", tintBg: "bg-neutral-100" },
  { key: "snapchat", label: "Snapchat", token: "com.toyopagroup.picaboo", icon: "logo-snapchat", tint: "#CA8A04", tintBg: "bg-warning-100" },
  { key: "reddit", label: "Reddit", token: "com.reddit.Reddit", icon: "logo-reddit", tint: "#EA580C", tintBg: "bg-warning-100" },
  { key: "facebook", label: "Facebook", token: "com.facebook.Facebook", icon: "logo-facebook", tint: "#2563EB", tintBg: "bg-primary-100" },
  { key: "twitch", label: "Twitch", token: "tv.twitch", icon: "logo-twitch", tint: "#7C3AED", tintBg: "bg-accent-100" },
  { key: "discord", label: "Discord", token: "com.hammerandchisel.discord", icon: "logo-discord", tint: "#6366F1", tintBg: "bg-primary-100" },
  { key: "netflix", label: "Netflix", token: "com.netflix.Netflix", icon: "film-outline", tint: "#DC2626", tintBg: "bg-danger-100" },
  { key: "games", label: "Games", token: "group.games.leisure", icon: "game-controller", tint: "#16A34A", tintBg: "bg-success-100" },
  { key: "browser_fun", label: "Web browsing", token: "group.web.leisure", icon: "globe-outline", tint: "#0891B2", tintBg: "bg-primary-100" },
];

/** Which `platform` value to stamp on chosen StakeApps for this device. */
function currentPlatform(): StakeApp["platform"] {
  if (Platform.OS === "ios") return "ios";
  if (Platform.OS === "android") return "android";
  return "desktop";
}

export interface AppPickerProps {
  visible: boolean;
  onClose: () => void;
  /** Optional callback with the number of apps selected on save (for a toast/copy). */
  onSaved?: (count: number) => void;
}

/**
 * The leisure-app multi-select. Reads the current `apps` from the stakes store
 * to seed selection, and writes back the full `StakeApp[]` on Save. Selection
 * is keyed on the catalog `key` (stored in `StakeApp.id`) so re-opening the
 * sheet reflects prior choices.
 */
export function AppPicker({ visible, onClose, onSaved }: AppPickerProps) {
  const reduceMotion = useReduceMotion();
  const storedApps = useStakesStore((s) => s.apps);
  const setApps = useStakesStore((s) => s.setApps);

  // Local selection set (catalog keys). Seeded from the store on open so the
  // sheet is a draft the user can cancel out of without mutating anything.
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!visible) return;
    // Seed from whichever stored apps map back onto the catalog (by id === key).
    const seed = new Set<string>();
    for (const app of storedApps) {
      if (CATALOG.some((c) => c.key === app.id)) seed.add(app.id);
    }
    setSelected(seed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const selectedCount = selected.size;

  const toggle = (key: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(new Set(CATALOG.map((c) => c.key)));
  };
  const clearAll = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelected(new Set());
  };

  const platform = useMemo(currentPlatform, []);

  const handleSave = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    // Preserve any previously-stored apps that AREN'T in our catalog (e.g. real
    // native tokens added elsewhere), and rebuild the catalog-backed entries
    // from the current selection. `id` === catalog key keeps this idempotent.
    const nonCatalog = storedApps.filter((a) => !CATALOG.some((c) => c.key === a.id));
    const chosen: StakeApp[] = CATALOG.filter((c) => selected.has(c.key)).map((c) => ({
      id: c.key,
      platform,
      tokenOrPackage: c.token,
      label: c.label,
      eligible: true,
    }));
    setApps([...nonCatalog, ...chosen]);
    onSaved?.(chosen.length);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? "fade" : "slide"}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={["bottom"]}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                </View>

                {/* Header */}
                <View className="flex-row items-start justify-between px-5 pt-3">
                  <View className="flex-1 pr-3">
                    <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
                      What&apos;s on the line
                    </Text>
                    <Heading size="h3" className="mt-1">
                      Choose apps to lock
                    </Heading>
                    <Text className="mt-1 text-caption text-neutral-500">
                      Pick the apps that pull you away. They go behind your task while a stake is on.
                    </Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color="#57534E" />
                  </Pressable>
                </View>

                {/* Select-all / clear row */}
                <View className="flex-row items-center justify-between px-5 pt-3">
                  <Text className="text-caption font-medium text-neutral-500">
                    {selectedCount > 0
                      ? `${selectedCount} on the line`
                      : "Nothing selected yet"}
                  </Text>
                  <View className="flex-row items-center gap-4">
                    <Pressable
                      onPress={selectAll}
                      hitSlop={6}
                      accessibilityRole="button"
                      accessibilityLabel="Select all apps"
                    >
                      <Text className="text-label font-medium text-primary-600">Select all</Text>
                    </Pressable>
                    <Pressable
                      onPress={clearAll}
                      hitSlop={6}
                      disabled={selectedCount === 0}
                      accessibilityRole="button"
                      accessibilityLabel="Clear selection"
                    >
                      <Text
                        className={`text-label font-medium ${
                          selectedCount === 0 ? "text-neutral-300" : "text-neutral-500"
                        }`}
                      >
                        Clear
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <ScrollView
                  className="mt-3 max-h-[52vh]"
                  contentContainerClassName="px-5 pb-4 gap-2"
                  showsVerticalScrollIndicator={false}
                >
                  {CATALOG.map((app) => {
                    const isSel = selected.has(app.key);
                    return (
                      <Pressable
                        key={app.key}
                        onPress={() => toggle(app.key)}
                        className={`flex-row items-center gap-3 rounded-xl border p-3.5 ${
                          isSel ? "border-primary-500 bg-primary-50" : "border-neutral-200 bg-white"
                        }`}
                        style={isSel ? undefined : shadows.xs}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: isSel }}
                        accessibilityLabel={app.label}
                        accessibilityHint={isSel ? "Selected. Tap to remove." : "Tap to put on the line."}
                      >
                        <View
                          className={`h-10 w-10 items-center justify-center rounded-full ${app.tintBg}`}
                        >
                          <Ionicons name={app.icon} size={20} color={app.tint} />
                        </View>
                        <Text
                          className={`flex-1 text-body-lg font-medium ${
                            isSel ? "text-primary-700" : "text-neutral-900"
                          }`}
                        >
                          {app.label}
                        </Text>
                        <Ionicons
                          name={isSel ? "checkmark-circle" : "ellipse-outline"}
                          size={22}
                          color={isSel ? "#2563EB" : "#D7D3CC"}
                        />
                      </Pressable>
                    );
                  })}

                  {/* Platform note — set expectations honestly. */}
                  <View className="mt-2 flex-row items-start gap-2.5 rounded-xl bg-neutral-100 p-3.5">
                    <Ionicons name="phone-portrait-outline" size={16} color="#6F6862" />
                    <Text className="flex-1 text-caption text-neutral-500">
                      On iPhone, you&apos;ll pick the real apps with Apple&apos;s Screen Time picker once app
                      locking is enabled. This list is a preview of what that feels like.
                    </Text>
                  </View>
                </ScrollView>

                {/* Footer */}
                <View className="border-t border-neutral-200 bg-white px-5 pb-2 pt-3" style={shadows.md}>
                  <Button
                    title={selectedCount > 0 ? `Save ${selectedCount} app${selectedCount === 1 ? "" : "s"}` : "Save"}
                    variant="primaryBlue"
                    size="lg"
                    onPress={handleSave}
                    accessibilityLabel="Save chosen apps"
                  />
                  <Pressable
                    onPress={onClose}
                    className="mt-2 items-center py-2.5"
                    accessibilityRole="button"
                    accessibilityLabel="Cancel"
                  >
                    <Text className="text-label font-medium text-neutral-500">Cancel</Text>
                  </Pressable>
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}
