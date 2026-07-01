import React, { useMemo } from 'react'
import { View, Text, type DimensionValue } from 'react-native'
import type { ScheduledBlock, CalEvent, Task } from '@/types'
import { slackColor } from '@/core/scheduler'
import { PressableScale } from '@/components/ui/PressableScale'
import { shadows } from '@/utils/design-tokens'
import { formatBlockTimeRange } from './hours'

/**
 * Deadline-slack visual mapping (PRD §9.5.5 / doc 02 §13.2). Color is NEVER the
 * sole signal — every block also carries a status dot and the block is labeled,
 * satisfying NFR-5 / §8.12. Events use a neutral treatment (no deadline slack).
 */
const SLACK_STYLES = {
  green: { accent: '#22C55E', tint: '#F0FDF4', dot: '#16A34A', label: 'On track' },
  amber: { accent: '#F97316', tint: '#FFF7ED', dot: '#EA580C', label: 'Getting close' },
  red: { accent: '#EF4444', tint: '#FEF2F2', dot: '#DC2626', label: 'At risk' },
} as const

const EVENT_STYLE = { accent: '#71717A', tint: '#FAFAFA', dot: '#71717A', label: 'Event' } as const

/** §8.7 height thresholds. */
const H_FULL = 44 // >= 44: title + time (+ meta)
const H_TITLE_ONLY = 28 // 28..44: title only
/** §8.7 width thresholds (as fractions of a phone column — resolved by caller sizing). */
const W_DENSE = 56 // < 56 px: colored bar + first ~6 chars

interface CalendarBlockProps {
  /** The placed session to render. Provide `block` for tasks. */
  block?: ScheduledBlock
  /** The owning task (for the label, "N steps", progress). Looked up by the caller via `tasks[block.taskId]`. */
  task?: Task
  /** A fixed calendar event to render instead of a task block. */
  event?: CalEvent
  /** px from the grid top (from `blockGeometry().top`). */
  top: number
  /** px height (from `blockGeometry().height`, already floored at 22). */
  height: number
  /** Left offset, e.g. "50%" or a px number (from `xFraction * 100`). @default "0%" */
  left?: DimensionValue
  /** Width, e.g. "50%" or a px number (from `widthFraction * 100`). @default "100%" */
  width?: DimensionValue
  /** Measured px width of the block, if known — drives the §8.7 WIDTH thresholds (dense mode). */
  measuredWidth?: number
  /** "now" for slack computation; defaults to Date.now(). Pass explicitly for determinism/tests. */
  now?: number
  onPress?: () => void
  /**
   * Render mode. When `true`, the block fills its parent (the parent owns
   * top/height/left/width, e.g. a draggable/resizable wrapper) and this
   * component drops its own absolute positioning + PressableScale. When `false`
   * (default), it positions itself absolutely and wraps in a PressableScale so
   * a tap fires `onPress` (the original, self-contained behavior).
   */
  fill?: boolean
  testID?: string
}

/** Count of not-yet-done subtasks -> the "N steps" chip (PRD FR-27 / §9.15). */
function remainingSteps(task?: Task): number {
  if (!task || task.subtasks.length === 0) return 0
  return task.subtasks.filter((s) => s.completedAt == null).length
}

/**
 * A premium calendar time block (PRD FR-25, FR-26, FR-27; doc 02 §13.3).
 *
 * - Absolutely positioned via `top`/`height`/`left`/`width` (the caller runs
 *   the geometry + overlap math from `core/calendar`).
 * - Soft tinted surface + a strong left accent bar in the deadline-slack color
 *   (neutral for events); a status dot repeats the signal for a11y.
 * - Dynamic typography (§8.7): time+title at >=44px, title-only 28–44px,
 *   ~6 chars when very short or in a dense (<56px wide) column. Never clips —
 *   always ellipsizes.
 * - Renders as ONE block with an "N steps" chip for auto-broken tasks (FR-27).
 * - Optional progress fill when `task.progressMin > 0` (FR-18).
 * - Wrapped in {@link PressableScale}; tap fires `onPress` (opens detail sheet).
 */
export function CalendarBlock({
  block,
  task,
  event,
  top,
  height,
  left = '0%',
  width = '100%',
  measuredWidth,
  now,
  onPress,
  fill = false,
  testID,
}: CalendarBlockProps) {
  const isEvent = !!event && !block
  const start = event?.start ?? block?.start ?? 0
  const end = event?.end ?? block?.end ?? 0
  const nowMs = now ?? Date.now()

  const style = useMemo(() => {
    if (isEvent) return EVENT_STYLE
    if (task) return SLACK_STYLES[slackColor(task, nowMs)]
    return SLACK_STYLES.green
  }, [isEvent, task, nowMs])

  const title = event?.title ?? task?.title ?? 'Untitled'
  const steps = remainingSteps(task)
  const done = block?.status === 'done'

  // Partial-completion fill fraction (FR-18): progress / total duration.
  const progressFraction =
    task && task.durationMin > 0 && (task.progressMin ?? 0) > 0
      ? Math.min(1, task.progressMin / task.durationMin)
      : 0

  // §8.7 thresholds — height first, then dense-width override.
  const dense = measuredWidth != null && measuredWidth < W_DENSE
  const showTime = !dense && height >= H_FULL
  const showTitle = !dense && height >= H_TITLE_ONLY
  const timeRange = formatBlockTimeRange(start, end)

  const a11yLabel = isEvent
    ? `Event: ${title}, ${timeRange}`
    : `${title}, ${timeRange}${steps > 0 ? `, ${steps} steps` : ''}, ${style.label}${done ? ', done' : ''}`

  const surface = (
      <View
        className="flex-1 rounded-lg overflow-hidden flex-row"
        style={[
          {
            backgroundColor: style.tint,
            borderWidth: 1,
            borderColor: isEvent ? '#E4E4E7' : `${style.accent}33`,
            opacity: done ? 0.6 : 1,
          },
          shadows.xs,
        ]}
      >
        {/* Left accent bar (doc 02 §13.3 "stronger left edge"). */}
        <View style={{ width: 3, backgroundColor: style.accent }} />

        {dense ? (
          // Dense column (§8.7 width < 56): bar + ~6 chars, tap for detail.
          <View className="flex-1 px-1 py-0.5 justify-center">
            <Text numberOfLines={1} className="text-tiny font-medium text-neutral-800">
              {title.slice(0, 6)}
            </Text>
          </View>
        ) : (
          <View className="flex-1 px-2 py-1 justify-start">
            {/* Header row: status dot + title (title-only when 28–44px). */}
            <View className="flex-row items-center">
              <View
                className="rounded-full mr-1.5"
                style={{ width: 6, height: 6, backgroundColor: style.dot }}
              />
              {showTitle ? (
                <Text
                  numberOfLines={1}
                  className={`flex-1 text-caption font-semibold ${done ? 'text-neutral-400 line-through' : 'text-neutral-900'}`}
                >
                  {title}
                </Text>
              ) : (
                // Very short (<28px): title only, single line, no dot crowding.
                <Text numberOfLines={1} className="flex-1 text-tiny font-medium text-neutral-800">
                  {title}
                </Text>
              )}
            </View>

            {/* Time + meta only when tall enough (§8.7 >= 44px). */}
            {showTime ? (
              <View className="flex-row items-center mt-0.5">
                <Text numberOfLines={1} className="text-tiny text-neutral-500 flex-shrink">
                  {timeRange}
                </Text>
                {steps > 0 ? (
                  <View className="ml-1.5 px-1.5 py-[1px] rounded-full bg-white/70 border border-neutral-200">
                    <Text className="text-tiny font-medium text-neutral-600">{steps} steps</Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Progress fill (FR-18) — only when there's room and progress exists. */}
            {progressFraction > 0 && height >= H_FULL ? (
              <View className="mt-1 h-[3px] rounded-full overflow-hidden bg-white/60">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${progressFraction * 100}%`, backgroundColor: style.accent }}
                />
              </View>
            ) : null}
          </View>
        )}
      </View>
  )

  // Fill mode: the parent (a draggable/resizable wrapper) owns position + the
  // tap/long-press gesture, so we just fill it. The wrapper carries the a11y
  // role; we mirror the label here for screen readers walking the subtree.
  if (fill) {
    return (
      <View
        style={{ flex: 1, paddingHorizontal: 3 }}
        accessibilityLabel={a11yLabel}
        testID={testID}
      >
        {surface}
      </View>
    )
  }

  // Default self-contained mode: absolutely positioned + tappable.
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      style={[
        {
          position: 'absolute',
          top,
          height,
          left,
          width,
          paddingHorizontal: 3,
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={a11yLabel}
      accessibilityHint="Opens details"
      testID={testID}
    >
      {surface}
    </PressableScale>
  )
}

export { H_FULL, H_TITLE_ONLY, W_DENSE }
