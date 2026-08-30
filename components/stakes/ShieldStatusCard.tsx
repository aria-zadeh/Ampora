/**
 * ShieldStatusCard — the Focus tab's at-rest "what's locked" preview.
 *
 * Aria's feedback (2026-08-29): "the app blocking feature is not shown that
 * much." App-locking is the whole premise of Ampora, but the only trace of
 * it on the Focus tab used to be one muted summary line buried inside the
 * hero composer. This card makes the shield itself the visible subject: a
 * full-bleed banner stating whether anything is on the line, then one row
 * per selected app (icon tile, name, category, "Locked" label, toggle-look),
 * styled to the measured `ignition-lock` geometry — 72-tall rows on an
 * 84 pitch, 40x40 icon tiles, a 48x28 toggle track — reused here inside the
 * current lock-first Focus IA rather than as the old dedicated full-screen
 * "Ignition Mode" the geometry was originally measured from.
 *
 * Every row (and the empty-state CTA) opens the same `AppPicker` sheet the
 * rest of the app already uses to manage the selection. This card only ever
 * DISPLAYS the current selection; it never mutates it directly.
 *
 * Purely presentational: reads `stakesStore`'s `apps`/`selection` and calls
 * nothing else. Reduce-motion aware via its children. RN + NativeWind,
 * web-export safe.
 */

import React, { useMemo, useState } from "react";
import { View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useShallow } from "zustand/react/shallow";

import { Text } from "@/components/ui/Text";
import { PressableScale } from "@/components/ui/PressableScale";
import { AppPicker, getStakeAppDisplayMeta } from "@/components/stakes/AppPicker";
import { useStakesStore, selectEligibleApps, selectStakeSelection } from "@/store/stakesStore";
import { iconSizes } from "@/utils/design-tokens";
import { useThemeColors } from "@/hooks/useThemeColors";
import type { StakeApp } from "@/types";

export function ShieldStatusCard() {
  const theme = useThemeColors();
  const eligibleApps = useStakesStore(useShallow(selectEligibleApps));
  const selection = useStakesStore(selectStakeSelection);
  const [pickerOpen, setPickerOpen] = useState(false);

  const namedApps = useMemo(() => eligibleApps.filter((a) => !!a.label), [eligibleApps]);
  const count = Math.max(selection?.count ?? 0, namedApps.length);
  const hasSelection = count > 0;
  const countLabel = count === 1 ? "1 app" : `${count} apps`;

  const openPicker = () => setPickerOpen(true);

  return (
    <View>
      <View
        className={`flex-row items-start gap-3 rounded-3xl border p-4 ${
          hasSelection ? "border-primary-500 bg-primary-100" : "border-line bg-surface"
        }`}
        accessibilityRole="summary"
        accessibilityLabel={hasSelection ? `${countLabel} on the line` : "Nothing on the line yet"}
      >
        <Ionicons
          name={hasSelection ? "lock-closed-outline" : "lock-open-outline"}
          size={iconSizes.md}
          color={hasSelection ? theme.primaryLight : theme.textSecondary}
        />
        <View className="flex-1">
          <Text variant="h4" className="text-neutral-900">
            {hasSelection ? `${countLabel} on the line` : "Nothing on the line yet"}
          </Text>
          <Text variant="caption" className="mt-1 text-neutral-600">
            {hasSelection ? "They lock once your session starts." : "Choose apps to lock during focus."}
          </Text>
        </View>
      </View>

      {hasSelection ? (
        <View className="mt-3 gap-3">
          {namedApps.length > 0 ? (
            namedApps.map((app) => <ShieldAppRow key={app.id} app={app} onPress={openPicker} />)
          ) : (
            <ShieldAppRow key="_count" count={count} onPress={openPicker} />
          )}
        </View>
      ) : (
        <PressableScale
          onPress={openPicker}
          haptic="light"
          className="mt-3 min-h-11 items-center justify-center rounded-lg border border-line bg-surface-ghost"
          accessibilityRole="button"
          accessibilityLabel="Choose apps to lock"
        >
          <Text variant="bodyMedium" className="text-neutral-900">
            Choose apps to lock
          </Text>
        </PressableScale>
      )}

      <AppPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// One locked-app row — 354x72 (full width here), pitch 84 via the parent's
// `gap-3`, per the measured `ignition-lock` geometry.
// ---------------------------------------------------------------------------

function ShieldAppRow({ app, count, onPress }: { app?: StakeApp; count?: number; onPress: () => void }) {
  const theme = useThemeColors();
  const meta = app ? getStakeAppDisplayMeta(app.id) : undefined;
  const label = app?.label ?? (count === 1 ? "1 app" : `${count} apps`);

  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      className="min-h-18 w-full flex-row items-center gap-3 rounded-xl border border-line bg-surface px-4 py-4"
      accessibilityRole="button"
      accessibilityLabel={`${label}, locked`}
      accessibilityHint="Opens the app picker"
    >
      <View className="h-10 w-10 items-center justify-center rounded-tile bg-raised">
        <Ionicons name={meta?.icon ?? "apps-outline"} size={20} color={meta?.tint ?? theme.textSecondary} />
      </View>
      <View className="flex-1">
        <Text variant="bodyMedium" className="text-neutral-900" numberOfLines={1}>
          {label}
        </Text>
        {meta?.category ? (
          <Text variant="meta" className="mt-0.5 text-neutral-600" numberOfLines={1}>
            {meta.category}
          </Text>
        ) : null}
      </View>
      <Text variant="meta" className="text-primary-400">
        Locked
      </Text>
      <View className="h-7 w-12 flex-row items-center justify-end rounded-full bg-primary-600 px-0.5">
        <View className="h-6 w-6 rounded-full bg-pure-white" />
      </View>
    </PressableScale>
  );
}
