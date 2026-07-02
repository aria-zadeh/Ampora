/**
 * BestWindowsChart — Focus DNA best-focus-windows visualization (FR-51).
 *
 * A small, premium bars-by-hour chart. Each bar is one hour of the day; its
 * height + fill weight encode how strongly that hour falls inside one of the
 * user's `bestWindows` (score 0..1). Windows are minutes-from-midnight ranges
 * (`FocusProfile.bestWindows`), so we project them onto a 24-hour grid.
 *
 * Never color-only: the strongest window carries a text label ("Your peak"),
 * hour ticks anchor the x-axis, and bar height (not just hue) encodes strength,
 * so the pattern reads without relying on color perception (AA).
 *
 * Pure/presentational. Cold-start safe: with no windows the parent shows the
 * "still learning" state instead of this chart, but this component also renders
 * a flat, faint baseline defensively if handed an empty set.
 */

import React, { useMemo } from "react";
import { View, Text } from "react-native";
import { colors } from "@/utils/design-tokens";

interface Window {
  /** Minutes from midnight, inclusive. */
  start: number;
  /** Minutes from midnight, exclusive. */
  end: number;
  /** 0..1 strength (already confidence-damped by the engine). */
  score: number;
}

interface BestWindowsChartProps {
  windows: Window[];
}

const HOURS = 24;
const MIN_PER_HOUR = 60;
/** Hour labels shown under the axis (kept sparse so they don't crowd). */
const AXIS_TICKS = [0, 6, 12, 18] as const;
const BAR_MAX_H = 96;
const BAR_MIN_H = 6;

/** Format an hour (0-23) as a short 12h label: 0->12a, 9->9a, 21->9p. */
function hourLabel(h: number): string {
  const period = h < 12 ? "a" : "p";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${period}`;
}

/** Human window range like "9–11pm" for the peak caption. */
function windowRangeLabel(w: Window): string {
  const startH = Math.floor(w.start / MIN_PER_HOUR);
  const endH = Math.floor(w.end / MIN_PER_HOUR);
  const startP = startH < 12 ? "am" : "pm";
  const endP = endH < 12 ? "am" : "pm";
  const s12 = startH % 12 === 0 ? 12 : startH % 12;
  const e12 = endH % 12 === 0 ? 12 : endH % 12;
  // Collapse a shared period ("9–11pm") when both ends share am/pm.
  if (startP === endP) return `${s12}–${e12}${endP}`;
  return `${s12}${startP}–${e12}${endP}`;
}

export function BestWindowsChart({ windows }: BestWindowsChartProps) {
  const c = colors.light;

  // Project windows onto a per-hour strength array (0..1). An hour's strength is
  // the max score of any window covering it.
  const perHour = useMemo(() => {
    const arr = new Array<number>(HOURS).fill(0);
    for (const w of windows) {
      const startH = Math.max(0, Math.floor(w.start / MIN_PER_HOUR));
      const endH = Math.min(HOURS, Math.ceil(w.end / MIN_PER_HOUR));
      for (let h = startH; h < endH; h++) {
        if (w.score > arr[h]) arr[h] = w.score;
      }
    }
    return arr;
  }, [windows]);

  const peakStrength = useMemo(() => Math.max(0, ...perHour), [perHour]);

  // The single strongest window, for the "Your peak" caption + label.
  const peakWindow = useMemo(() => {
    if (windows.length === 0) return null;
    return [...windows].sort((a, b) => b.score - a.score)[0];
  }, [windows]);

  const peakHour = useMemo(() => {
    let best = -1;
    let bestVal = 0;
    perHour.forEach((v, h) => {
      if (v > bestVal) {
        bestVal = v;
        best = h;
      }
    });
    return best;
  }, [perHour]);

  return (
    <View accessibilityLabel="Your best focus hours across the day">
      {/* Peak caption — text label so the insight is never color-only. */}
      {peakWindow ? (
        <View className="mb-3 flex-row items-center">
          <View
            className="mr-2 h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: c.primary }}
          />
          <Text className="text-caption font-medium text-neutral-600">
            Peak focus around{" "}
            <Text className="font-semibold text-neutral-900">
              {windowRangeLabel(peakWindow)}
            </Text>
          </Text>
        </View>
      ) : null}

      {/* Bars */}
      <View
        className="flex-row items-end justify-between"
        style={{ height: BAR_MAX_H }}
      >
        {perHour.map((strength, h) => {
          const norm = peakStrength > 0 ? strength / peakStrength : 0;
          const height =
            strength <= 0 ? BAR_MIN_H : BAR_MIN_H + norm * (BAR_MAX_H - BAR_MIN_H);
          const isPeak = h === peakHour && strength > 0;
          // Empty hours: faint neutral tick. Active hours: primary, opacity by
          // strength so height AND weight both encode the value.
          const backgroundColor =
            strength <= 0
              ? c.border
              : isPeak
                ? c.primary
                : c.primaryLight;
          const opacity = strength <= 0 ? 1 : 0.4 + norm * 0.6;
          return (
            <View
              key={h}
              style={{
                flex: 1,
                height,
                marginHorizontal: 0.5,
                borderRadius: 3,
                backgroundColor,
                opacity,
              }}
            />
          );
        })}
      </View>

      {/* Axis ticks */}
      <View className="mt-2 flex-row justify-between">
        {AXIS_TICKS.map((h) => (
          <Text key={h} className="text-tiny text-neutral-500">
            {hourLabel(h)}
          </Text>
        ))}
        <Text className="text-tiny text-neutral-500">{hourLabel(0)}</Text>
      </View>
    </View>
  );
}
