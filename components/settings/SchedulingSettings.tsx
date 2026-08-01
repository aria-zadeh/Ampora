/**
 * SchedulingSettings — the remaining §8.11 scheduling defaults not surfaced
 * elsewhere (Phase 7, PRD FR-9 / FR-11 / FR-14 / FR-65).
 *
 * Exposes the app-wide DEFAULTS a new auto-scheduled task inherits:
 * - Default buffers before / after a block.
 * - Default Split toggle + Min / Max session block.
 * - Workload distribution (Balanced / Front-load).
 * - Auto-schedule cutoff (weeks).
 * - A read-only scheduling-hours summary (editing lives in Busy times).
 *
 * All values write through `useSettingsStore.updateSettings`; nothing is held
 * in local-only state that could drift. Fields are optional on `Settings`, so
 * each read falls back to the documented default. Warm, grouped, premium —
 * embeds under its own section header on the full-settings screen (renders its
 * own cards, like StakesSettings). RN + NativeWind, web-export safe.
 */

import React, { useMemo } from 'react'
import { View, Text } from 'react-native'
import { useSettingsStore } from '@/store/settingsStore'
import type { Settings } from '@/types'
import { colors } from '@/utils/design-tokens'
import {
  SectionLabel,
  SectionFootnote,
  Group,
  Row,
  Stepper,
  InlineSegmented,
  formatMinutes,
  formatClock,
} from '@/components/settings/SettingsPrimitives'

// ---------------------------------------------------------------------------
// Bounds / steps for each control. Kept generous but sane.
// ---------------------------------------------------------------------------

const BUFFER_MIN = 0
const BUFFER_MAX = 60
const BUFFER_STEP = 5

const BLOCK_MIN_FLOOR = 15
const BLOCK_MIN_CEIL = 120
const BLOCK_MAX_FLOOR = 30
const BLOCK_MAX_CEIL = 240
const BLOCK_STEP = 15

const CUTOFF_MIN_WEEKS = 1
const CUTOFF_MAX_WEEKS = 12

/** Day-of-week short labels, index 0 = Sunday (matches Date#getDay / SchedulingHours). */
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function formatWeeks(w: number): string {
  return w === 1 ? '1 week' : `${w} weeks`
}

/**
 * A compact, human summary of the default scheduling-hours template. Groups
 * days that share the same window set so "Mon–Fri 3:00 PM–9:00 PM" reads
 * cleanly rather than listing seven lines. Returns a small list of phrases.
 */
function summarizeSchedulingHours(hours: Settings['schedulingHours']): string[] {
  const withWindows = hours.perDay.filter((d) => d.windows.length > 0)
  if (withWindows.length === 0) return ['No scheduling hours set']

  // Signature per day so identical window-sets collapse together.
  const sig = (windows: { start: number; end: number }[]) =>
    windows.map((w) => `${w.start}-${w.end}`).join('|')

  const bySig = new Map<string, { days: number[]; windows: { start: number; end: number }[] }>()
  for (const d of withWindows) {
    const key = sig(d.windows)
    const existing = bySig.get(key)
    if (existing) existing.days.push(d.day)
    else bySig.set(key, { days: [d.day], windows: d.windows })
  }

  return Array.from(bySig.values()).map(({ days, windows }) => {
    const sorted = [...days].sort((a, b) => a - b)
    const dayPart = summarizeDayRange(sorted)
    const winPart = windows
      .map((w) => `${formatClock(w.start)}–${formatClock(w.end)}`)
      .join(', ')
    return `${dayPart} · ${winPart}`
  })
}

/** "Mon–Fri" for a contiguous run, else "Mon, Wed, Fri". */
function summarizeDayRange(days: number[]): string {
  if (days.length === 0) return ''
  if (days.length === 1) return DAY_LABELS[days[0]]
  const contiguous = days.every((d, i) => i === 0 || d === days[i - 1] + 1)
  if (contiguous && days.length > 2) {
    return `${DAY_LABELS[days[0]]}–${DAY_LABELS[days[days.length - 1]]}`
  }
  return days.map((d) => DAY_LABELS[d]).join(', ')
}

// ---------------------------------------------------------------------------
// SchedulingSettings
// ---------------------------------------------------------------------------

export function SchedulingSettings() {
  const settings = useSettingsStore((s) => s.settings)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  // Reads with documented fallbacks (fields are optional on Settings).
  const bufferBefore = settings.defaultBufferBeforeMin ?? 0
  const bufferAfter = settings.defaultBufferAfterMin ?? 0
  const splittable = settings.defaultSplittable ?? true
  const minBlock = settings.defaultMinBlockMin ?? 30
  const maxBlock = settings.defaultMaxBlockMin ?? 120
  const workload = settings.workloadDistribution ?? 'balanced'
  const cutoffWeeks = settings.autoScheduleCutoffWeeks ?? 4

  const hoursSummary = useMemo(
    () => summarizeSchedulingHours(settings.schedulingHours),
    [settings.schedulingHours]
  )

  // Keep min ≤ max: nudging one past the other drags the other with it.
  const setMinBlock = (next: number) =>
    updateSettings({
      defaultMinBlockMin: next,
      defaultMaxBlockMin: Math.max(next, maxBlock),
    })
  const setMaxBlock = (next: number) =>
    updateSettings({
      defaultMaxBlockMin: next,
      defaultMinBlockMin: Math.min(next, minBlock),
    })

  return (
    <View>
      <Text className="mb-4 text-body text-neutral-500">
        Defaults for how Ampora places new tasks on your calendar. Any task can
        still override these on its own.
      </Text>

      {/* Buffers ------------------------------------------------------------ */}
      <SectionLabel>Buffers</SectionLabel>
      <Group>
        <Row
          icon="chevron-back-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="Buffer before"
          sublabel="Quiet time held before each block"
          trailing={
            <Stepper
              value={bufferBefore}
              min={BUFFER_MIN}
              max={BUFFER_MAX}
              step={BUFFER_STEP}
              onChange={(v) => updateSettings({ defaultBufferBeforeMin: v })}
              format={formatMinutes}
              a11yLabel="buffer before"
            />
          }
        />
        <Row
          icon="chevron-forward-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="Buffer after"
          sublabel="Quiet time held after each block"
          trailing={
            <Stepper
              value={bufferAfter}
              min={BUFFER_MIN}
              max={BUFFER_MAX}
              step={BUFFER_STEP}
              onChange={(v) => updateSettings({ defaultBufferAfterMin: v })}
              format={formatMinutes}
              a11yLabel="buffer after"
            />
          }
          isLast
        />
      </Group>

      {/* Splitting ---------------------------------------------------------- */}
      <View className="mt-6">
        <SectionLabel>Session splitting</SectionLabel>
      </View>
      <Group>
        <Row
          icon="git-branch-outline"
          label="Split long tasks"
          sublabel="Break big tasks into several sessions"
          trailing={
            <InlineSegmented
              value={splittable ? 'on' : 'off'}
              options={[
                { key: 'on', label: 'On' },
                { key: 'off', label: 'Off' },
              ]}
              onChange={(k) => updateSettings({ defaultSplittable: k === 'on' })}
              a11yLabel="Split long tasks"
            />
          }
          isLast={!splittable}
        />
        {splittable ? (
          <>
            <Row
              icon="contract-outline"
              label="Minimum block"
              sublabel="Shortest a single session can be"
              trailing={
                <Stepper
                  value={minBlock}
                  min={BLOCK_MIN_FLOOR}
                  max={BLOCK_MIN_CEIL}
                  step={BLOCK_STEP}
                  onChange={setMinBlock}
                  format={formatMinutes}
                  a11yLabel="minimum block"
                />
              }
            />
            <Row
              icon="expand-outline"
              label="Maximum block"
              sublabel="Longest a single session can run"
              trailing={
                <Stepper
                  value={maxBlock}
                  min={BLOCK_MAX_FLOOR}
                  max={BLOCK_MAX_CEIL}
                  step={BLOCK_STEP}
                  onChange={setMaxBlock}
                  format={formatMinutes}
                  a11yLabel="maximum block"
                />
              }
              isLast
            />
          </>
        ) : null}
      </Group>

      {/* Workload distribution --------------------------------------------- */}
      <View className="mt-6">
        <SectionLabel>Workload</SectionLabel>
      </View>
      <Group>
        <Row
          icon="bar-chart-outline"
          label="Distribution"
          sublabel={
            workload === 'balanced'
              ? 'Spread evenly across the days you have'
              : 'Do it as early as possible'
          }
          trailing={
            <InlineSegmented
              value={workload}
              options={[
                { key: 'balanced', label: 'Balanced' },
                { key: 'frontload', label: 'Front-load' },
              ]}
              onChange={(k) => updateSettings({ workloadDistribution: k })}
              a11yLabel="Workload distribution"
            />
          }
          isLast
        />
      </Group>
      <SectionFootnote>
        A task near or past its due date front-loads automatically, whatever this
        is set to.
      </SectionFootnote>

      {/* Auto-schedule horizon --------------------------------------------- */}
      <View className="mt-6">
        <SectionLabel>Planning horizon</SectionLabel>
      </View>
      <Group>
        <Row
          icon="calendar-clear-outline"
          label="Auto-schedule cutoff"
          sublabel="Only place tasks due within this window"
          trailing={
            <Stepper
              value={cutoffWeeks}
              min={CUTOFF_MIN_WEEKS}
              max={CUTOFF_MAX_WEEKS}
              step={1}
              onChange={(v) => updateSettings({ autoScheduleCutoffWeeks: v })}
              format={formatWeeks}
              a11yLabel="auto-schedule cutoff"
            />
          }
          isLast
        />
      </Group>

      {/* Scheduling-hours summary (read-only) ------------------------------ */}
      <View className="mt-6">
        <SectionLabel>Scheduling hours</SectionLabel>
      </View>
      <Group>
        {hoursSummary.map((line, i) => (
          <Row
            key={line}
            icon={i === 0 ? 'time-outline' : 'ellipse-outline'}
            iconTint={colors.light.successAccent}
            iconBg="bg-success-100"
            label={line}
            isLast={i === hoursSummary.length - 1}
          />
        ))}
      </Group>
      <SectionFootnote>
        These are the times tasks may be scheduled into. Edit them under Busy
        times.
      </SectionFootnote>
    </View>
  )
}
