import React, { useMemo } from 'react'
import { View, Text, type DimensionValue } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import type { ScheduledBlock, CalEvent, Task } from '@/types'
import { slackColor } from '@/core/scheduler'
import { PressableScale } from '@/components/ui/PressableScale'
import { colors, shadows } from '@/utils/design-tokens'
import { useThemeColors } from '@/hooks/useThemeColors'
import { formatBlockTimeRange } from './hours'

/** Any key of a resolved `useThemeColors()` set — the two tables below name these, not hexes. */
type ColorToken = keyof typeof colors.light

/**
 * Deadline-slack visual mapping (PRD §9.5.5 / doc 02 §13.2). Color is NEVER the
 * sole signal — every block also carries a status dot and the block is labeled,
 * satisfying NFR-5 / §8.12. Events use a neutral treatment (no deadline slack).
 *
 * Each entry names `colors` KEYS rather than hexes, so one semantic mapping
 * resolves through `useThemeColors()` on either canvas without the meanings
 * moving: green stays "On track", amber "Getting close", red "At risk". The
 * accent/dot steps are identical in both themes (doc 02 §14.1), so all that
 * actually flips is the `tint` the block is filled with — the pale wash
 * (`successLight`/`warningLight`/`dangerLight`) on light, its warm near-black
 * counterpart on dark. A block is a FILL, not accent text, so the accent and
 * dot deliberately keep one value across themes.
 */
// `*Subtle` (the .50 step), not `*Light` (.100). A block is a large tinted
// surface with a time label reading on top of it, which is exactly what the
// subtle step exists for: on .100 that label measures 4.49:1 on the danger
// tint, a hair under AA, which would force the label a step darker and make
// every block read more saturated than the design intends. On .50 the label
// clears at 5.01 to 5.23:1 and the wash stays quiet. The dark values are
// identical for both steps, since the dark tints are already near-black and
// going subtler would lose the slack colour entirely.
const SLACK_TOKENS = {
  green: { accent: 'success', tint: 'successSubtle', dot: 'successAccent', label: 'On track' },
  amber: { accent: 'warning', tint: 'warningSubtle', dot: 'warningAccent', label: 'Getting close' },
  red: { accent: 'danger', tint: 'dangerSubtle', dot: 'dangerStrong', label: 'At risk' },
} as const satisfies Record<
  string,
  { accent: ColorToken; tint: ColorToken; dot: ColorToken; label: string }
>

const EVENT_TOKENS = {
  accent: 'textMuted',
  tint: 'elevated',
  dot: 'textMuted',
  label: 'Event',
} as const satisfies { accent: ColorToken; tint: ColorToken; dot: ColorToken; label: string }

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
  // The block's fill/accent/dot are RN style values, not classes, so they
  // resolve through the active scheme rather than a `dark:` variant.
  const theme = useThemeColors()

  const style = useMemo(() => {
    const tokens = isEvent
      ? EVENT_TOKENS
      : task
        ? SLACK_TOKENS[slackColor(task, nowMs)]
        : SLACK_TOKENS.green
    return {
      accent: theme[tokens.accent],
      tint: theme[tokens.tint],
      dot: theme[tokens.dot],
      label: tokens.label,
    }
  }, [isEvent, task, nowMs, theme])

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
  // All-day events have no meaningful clock time — their start/end are either
  // a midnight-to-midnight marker or a per-day clip of a multi-day span
  // (`selectEventsByDay`'s render-only clamp), so formatting them as a time
  // range would show something like "12 – 12 AM". Every view (Day/3-Day/Week/
  // Month/Agenda) renders events through this one component, so fixing the
  // label here fixes it everywhere at once.
  const timeRange = isEvent && event?.allDay ? 'All day' : formatBlockTimeRange(start, end)

  const a11yLabel = isEvent
    ? `Event: ${title}, ${timeRange}`
    : `${title}, ${timeRange}${steps > 0 ? `, ${steps} steps` : ''}, ${style.label}${done ? ', done' : ''}${block?.pinned ? ', locked' : ''}`

  const surface = (
      <View
        className="flex-1 rounded-lg overflow-hidden flex-row"
        style={[
          {
            backgroundColor: style.tint,
            borderWidth: 1,
            // Events read as fixed/external by SHAPE, not just their neutral
            // tint (FR-1, FR-12; doc 02 "never color alone") — a dashed
            // border reads as "placed here, not scheduled by the engine"
            // regardless of hue, on top of the distinct EVENT_TOKENS tint and
            // the calendar glyph below.
            borderStyle: isEvent ? 'dashed' : 'solid',
            // borderStrong rather than the default border, because on dark the
            // default border and the event tint are the SAME token value
            // (`#292524`), which would erase the dashed shape cue exactly
            // where it still has to read. Both borders are decorative under
            // doc 02 §1.8, so the one step up costs nothing on light.
            borderColor: isEvent ? theme.borderStrong : `${style.accent}33`,
            opacity: done ? 0.6 : 1,
          },
          shadows.xs,
        ]}
      >
        {/* Left accent bar (doc 02 §13.3 "stronger left edge"). */}
        <View style={{ width: 3, backgroundColor: style.accent }} />

        {dense ? (
          // Dense column (§8.7 width < 56): bar + as much title as fits, tap
          // for detail. This used to hard-slice the title to 6 characters,
          // which silently assumed a font advance width: a fixed character
          // count measures wider in Lexend than it did in Inter, so 6 wide
          // glyphs could overflow the ~45px of usable width. Let the layout
          // measure instead — `numberOfLines` + tail ellipsis truncate at the
          // real width, at any typeface, and unlike the slice they leave a
          // visible signal that there is more title than is shown.
          <View className="flex-1 px-1 py-0.5 justify-center">
            <Text
              numberOfLines={1}
              ellipsizeMode="tail"
              className="text-tiny font-medium text-neutral-800 dark:text-neutral-100"
            >
              {title}
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
                  className={`flex-1 text-caption font-semibold ${
                    done
                      ? 'text-neutral-500 dark:text-neutral-400 line-through'
                      : 'text-neutral-900 dark:text-neutral-50'
                  }`}
                >
                  {title}
                </Text>
              ) : (
                // Very short (<28px): title only, single line, no dot crowding.
                <Text
                  numberOfLines={1}
                  className="flex-1 text-tiny font-medium text-neutral-800 dark:text-neutral-100"
                >
                  {title}
                </Text>
              )}
            </View>

            {/* Time + meta only when tall enough (§8.7 >= 44px). */}
            {showTime ? (
              <View className="flex-row items-center mt-0.5">
                {/* This 11px line sits on a SLACK TINT, not a plain surface,
                    so neither half of the cheatsheet's muted pair can be used
                    unchecked. Light keeps the original `neutral-500`: on the
                    `.50` subtle tints these blocks use it measures 5.01 to
                    5.23:1, clearing the 4.5:1 that 11px text owes. It would
                    NOT clear on the `.100` step (4.49:1 over danger), which is
                    the whole reason `*Subtle` exists rather than this label
                    being darkened to compensate for a heavier wash. On dark
                    the muted step is calibrated against the dark CARD and
                    drops to 2.78:1 on the slack tint, so dark steps to
                    `neutral-400`, which holds 5.26 to 6.36:1. */}
                <Text
                  numberOfLines={1}
                  className="text-tiny text-neutral-500 dark:text-neutral-400 flex-shrink"
                >
                  {timeRange}
                </Text>
                {steps > 0 ? (
                  <View className="ml-1.5 px-1.5 py-[1px] rounded-full bg-white/70 border border-neutral-200 dark:bg-black/30 dark:border-neutral-700">
                    <Text className="text-tiny font-medium text-neutral-600 dark:text-neutral-300">
                      {steps} steps
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}

            {/* Progress fill (FR-18) — only when there's room and progress exists. */}
            {progressFraction > 0 && height >= H_FULL ? (
              <View className="mt-1 h-[3px] rounded-full overflow-hidden bg-white/60 dark:bg-black/30">
                <View
                  className="h-full rounded-full"
                  style={{ width: `${progressFraction * 100}%`, backgroundColor: style.accent }}
                />
              </View>
            ) : null}
          </View>
        )}

        {/* Pinned affordance (Round B fix #7): a tiny lock glyph, top-right,
            so a user can see at a glance which blocks are immovable inputs to
            the next recompute (PRD §9.5.10). Never the sole signal — the
            a11y label below also announces "locked". Purely decorative. */}
        {block?.pinned && !dense ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 3, right: 3, opacity: 0.6 }}
          >
            <Ionicons name="lock-closed" size={12} color={style.dot} />
          </View>
        ) : null}

        {/* Fixed-event glyph, same corner slot (mutually exclusive with the
            pin glyph — a block is never both). One more non-color cue that
            this is a fixed Event, not a scheduled Task block. */}
        {isEvent && !dense ? (
          <View
            pointerEvents="none"
            style={{ position: 'absolute', top: 3, right: 3, opacity: 0.55 }}
          >
            <Ionicons name="calendar-clear-outline" size={12} color={style.dot} />
          </View>
        ) : null}
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
