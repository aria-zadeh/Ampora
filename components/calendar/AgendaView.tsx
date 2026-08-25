import React, { useEffect, useMemo, useState } from 'react'
import { View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { FlashList } from '@shopify/flash-list'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import { useScheduleStore, selectAllBlocks, selectAllCalEvents } from '@/store/scheduleStore'
import { useTaskStore } from '@/store/taskStore'
import { useListStore, selectAllLists } from '@/store/listStore'
import { useStakesStore } from '@/store/stakesStore'
import { slackColor } from '@/core/scheduler'
import { spansOverlap } from '@/core/calendar'
import type { CalEvent, ScheduledBlock, Task } from '@/types'
import { PressableScale } from '@/components/ui/PressableScale'
import { EmptyState } from '@/components/ui/EmptyState'
import { Text } from '@/components/ui/Text'
import { colors, shadows, spacing, listColors, tabularNums, type ListColorName } from '@/utils/design-tokens'
import { DURATIONS, staggerDelay } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { dayStart, formatClockTime } from './hours'

const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** Fixed width of the time column so every row's title starts at the same x, matching the reference day-card's aligned time gutter. */
const TIME_COL_WIDTH = 58
/** Chip-row indent, so chips line up under the title: 8 (dot) + 10 (row gap) + 58 (time column). Keep in sync with the row's own `w-2`/`gap-2.5` classes below. */
const CHIP_INDENT = 76

export interface AgendaViewProps {
  /**
   * Anchor date (epoch ms). Blocks that end on/after this day's local midnight
   * are shown, grouped ascending. Defaults to "today" behavior when the anchor
   * is the current day.
   */
  date: number
  /** Fired with the tapped block (opens the detail sheet). */
  onBlockPress?: (block: ScheduledBlock) => void
  /** Fired with the tapped CalEvent. */
  onEventPress?: (event: CalEvent) => void
  testID?: string
}

/** One row inside a day card: a scheduled task block or a fixed CalEvent, plus its sort key. */
type DayNode =
  | {
      kind: 'task'
      key: string
      sortTime: number
      block: ScheduledBlock
      task: Task
      atRisk: boolean
      gettingClose: boolean
    }
  | { kind: 'event'; key: string; sortTime: number; event: CalEvent }

/** One FlashList item: a day's label plus its white day-card of rows. */
interface DaySection {
  key: string
  dayStart: number
  label: string
  isToday: boolean
  nodes: DayNode[]
  /** Block ids that overlap another block in this same day (pure `spansOverlap` sweep, task-vs-task only). */
  overlapIds: Set<string>
}

/** "Wed 12", "Thu 13 · Today": the reference day-card header. Only "today" gets the suffix. */
function formatDayLabel(dayStartMs: number, todayStart: number): string {
  const d = new Date(dayStartMs)
  const base = `${WEEKDAY_SHORT[d.getDay()]} ${d.getDate()}`
  return dayStartMs === todayStart ? `${base} · Today` : base
}

/** Not-yet-done subtasks -> the "N steps" chip (PRD FR-27). */
function remainingSteps(task: Task): number {
  if (task.subtasks.length === 0) return 0
  return task.subtasks.filter((s) => s.completedAt == null).length
}

/**
 * Resolve a list's stored hex to its nearest `listColors` pastel `bar` tone
 * for the row dot, mirroring `TaskCard`'s own `resolveBarColor` (same
 * fallback-to-raw-hex when nothing matches) so a list reads the same color
 * here as everywhere else. Falls back to the neutral `slate` tone for rows
 * with no list (fixed events, list-less tasks).
 */
function listDotColor(hex: string | undefined): string {
  if (!hex) return listColors.slate.bar
  const upper = hex.toUpperCase()
  const match = (Object.keys(listColors) as ListColorName[]).find(
    (name) => listColors[name].bar.toUpperCase() === upper || listColors[name].text.toUpperCase() === upper
  )
  return match ? listColors[match].bar : hex
}

/**
 * AgendaView (PRD FR-23): a day-card agenda. One white card per local day
 * (today, then upcoming, ascending) holds that day's ScheduledBlocks and
 * CalEvents as compact rows: a list-colour dot, a fixed-width start time, and
 * the title, with a chip row underneath for "N steps", a Locked stake, "At
 * risk", "Overlaps", and "Fixed event" / "All day". Today's card carries a
 * live now-line at its correct chronological slot, ticking once a minute.
 * All-day events sort first within a day. Built on FlashList, one item per
 * day now instead of one item per row, so a day's rows can share one card.
 *
 * Data flows through the store selectors with useShallow (project rule).
 * Rows for tasks deleted since the last recompute are skipped.
 */
export function AgendaView({ date, onBlockPress, onEventPress, testID }: AgendaViewProps) {
  const reduceMotion = useReduceMotion()

  // Existing selectors, unchanged (Zustand v5 useShallow rule).
  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const calEvents = useScheduleStore(useShallow(selectAllCalEvents))
  const tasks = useTaskStore((s) => s.tasks)

  // Lists, for each task row's list-colour dot.
  const lists = useListStore(useShallow(selectAllLists))
  const listColorById = useMemo(() => {
    const map: Record<string, string> = {}
    for (const l of lists) map[l.id] = l.color
    return map
  }, [lists])

  // Stakes, for the "Locked" chip: raw selects only (a primitive plus the
  // store's own record field), matching app/(tabs)/tasks.tsx's own has-stake
  // selector discipline. The Object.values walk happens in useMemo below,
  // never inside the selector itself.
  const activeStakeTaskId = useStakesStore((s) => s.activeSession?.taskId ?? null)
  const scheduledStakesRecord = useStakesStore((s) => s.scheduledStakes)
  const stakedTaskIdSet = useMemo(() => {
    const s = new Set<string>()
    if (activeStakeTaskId) s.add(activeStakeTaskId)
    for (const stake of Object.values(scheduledStakesRecord)) s.add(stake.taskId)
    return s
  }, [activeStakeTaskId, scheduledStakesRecord])

  const sections = useMemo<DaySection[]>(() => {
    const now = Date.now()
    const todayStart = dayStart(now)
    // Show everything ending on/after the later of "now" and the anchor day's
    // midnight, so navigating forward re-anchors the agenda.
    const floor = Math.min(dayStart(date), todayStart)

    type Entry = { dayKey: number; sortRank: 0 | 1; sortTime: number; node: DayNode }
    const entries: Entry[] = []

    for (const block of blocks) {
      if (block.end < floor) continue
      const task = tasks[block.taskId]
      if (!task) continue // stale block; task deleted since last recompute
      const slack = slackColor(task, now)
      entries.push({
        dayKey: dayStart(block.start),
        sortRank: 1,
        sortTime: block.start,
        node: {
          kind: 'task',
          key: block.id,
          sortTime: block.start,
          block,
          task,
          atRisk: slack === 'red',
          gettingClose: slack === 'amber',
        },
      })
    }

    for (const event of calEvents) {
      if (event.end < floor) continue
      // An event already under way when the visible range starts (e.g. a
      // multi-day all-day span that began before `floor`) is grouped under
      // the FIRST visible day instead of growing a stray past-day header,
      // presentational only, mirrors `scheduleStore#selectEventsByDay`'s
      // per-day render clamp; the canonical event is untouched.
      const groupStart = Math.max(event.start, floor)
      entries.push({
        dayKey: dayStart(groupStart),
        sortRank: event.allDay ? 0 : 1, // all-day events lead their day section
        sortTime: groupStart,
        node: { kind: 'event', key: event.id, sortTime: groupStart, event },
      })
    }

    entries.sort((a, b) => a.dayKey - b.dayKey || a.sortRank - b.sortRank || a.sortTime - b.sortTime)

    const out: DaySection[] = []
    let current: DaySection | null = null
    for (const entry of entries) {
      if (!current || current.dayStart !== entry.dayKey) {
        current = {
          key: `d-${entry.dayKey}`,
          dayStart: entry.dayKey,
          label: formatDayLabel(entry.dayKey, todayStart),
          isToday: entry.dayKey === todayStart,
          nodes: [],
          overlapIds: new Set<string>(),
        }
        out.push(current)
      }
      current.nodes.push(entry.node)
    }

    // "Overlaps" chip (task rows only, within the same day): reuses the
    // existing pure `spansOverlap` sweep-test. No new geometry invented.
    for (const section of out) {
      const taskNodes = section.nodes.filter(
        (n): n is Extract<DayNode, { kind: 'task' }> => n.kind === 'task'
      )
      for (let i = 0; i < taskNodes.length; i++) {
        for (let j = i + 1; j < taskNodes.length; j++) {
          if (spansOverlap(taskNodes[i].block, taskNodes[j].block)) {
            section.overlapIds.add(taskNodes[i].block.id)
            section.overlapIds.add(taskNodes[j].block.id)
          }
        }
      }
    }

    return out
  }, [blocks, calEvents, tasks, date])

  // A single combined signal FlashList can compare by reference, so a stakes
  // or list change repaints already-mounted rows the same way `reduceMotion`
  // alone did before.
  const extraData = useMemo(
    () => ({ reduceMotion, listColorById, stakedTaskIdSet }),
    [reduceMotion, listColorById, stakedTaskIdSet]
  )

  if (sections.length === 0) {
    return (
      <View className="flex-1" testID={testID}>
        <EmptyState
          icon="calendar-outline"
          title="Nothing scheduled"
          subtitle="Add a task with a duration and the engine will place it on your calendar."
        />
      </View>
    )
  }

  return (
    <View className="flex-1" testID={testID}>
      <FlashList
        data={sections}
        keyExtractor={(item) => item.key}
        extraData={extraData}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 12 }}
        showsVerticalScrollIndicator={false}
        renderItem={({ item, index }) => (
          <DayCard
            section={item}
            index={index}
            reduceMotion={reduceMotion}
            listColorById={listColorById}
            stakedTaskIdSet={stakedTaskIdSet}
            onBlockPress={onBlockPress}
            onEventPress={onEventPress}
          />
        )}
      />
    </View>
  )
}

/**
 * Ticks once per minute, aligned to the minute boundary. Same concept as
 * TimeGrid's own NowLine, reimplemented locally since editing TimeGrid.tsx is
 * out of scope here. Skips setting up the interval when `enabled` is false,
 * so only today's mounted card ever actually ticks.
 */
function useNowMinute(enabled: boolean): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!enabled) return
    let interval: ReturnType<typeof setInterval> | null = null
    const msToNextMinute = 60_000 - (Date.now() % 60_000)
    const timeout = setTimeout(() => {
      setNow(Date.now())
      interval = setInterval(() => setNow(Date.now()), 60_000)
    }, msToNextMinute)
    return () => {
      clearTimeout(timeout)
      if (interval) clearInterval(interval)
    }
  }, [enabled])

  return now
}

/** One day's label plus its white day-card of rows (one FlashList item). */
function DayCard({
  section,
  index,
  reduceMotion,
  listColorById,
  stakedTaskIdSet,
  onBlockPress,
  onEventPress,
}: {
  section: DaySection
  index: number
  reduceMotion: boolean
  listColorById: Record<string, string>
  stakedTaskIdSet: Set<string>
  onBlockPress?: (block: ScheduledBlock) => void
  onEventPress?: (event: CalEvent) => void
}) {
  const now = useNowMinute(section.isToday)

  // Where the now-line falls among this day's rows (today only): the index of
  // the first row that starts after `now`, or the end of the list if none do.
  const nowIndex = useMemo(() => {
    if (!section.isToday) return -1
    const idx = section.nodes.findIndex((n) => n.sortTime > now)
    return idx === -1 ? section.nodes.length : idx
  }, [section.isToday, section.nodes, now])

  const entering =
    reduceMotion || index > 6
      ? undefined
      : FadeInDown.delay(staggerDelay(index)).duration(DURATIONS.base)

  return (
    <Animated.View entering={entering} style={{ marginTop: index === 0 ? 0 : spacing.group }}>
      <Text variant="overline" className="text-neutral-500 px-0.5 pb-1.5" style={tabularNums}>
        {section.label}
      </Text>
      <View className="bg-white rounded-lg px-4 pt-0.5 pb-1" style={shadows.xs}>
        {section.nodes.map((node, i) => {
          // Borderless when it's the day's first row, or when it immediately
          // follows the now-line (avoids a double divider directly under it).
          const first = i === 0 || i === nowIndex
          return (
            <React.Fragment key={node.key}>
              {i === nowIndex ? <NowDivider time={now} /> : null}
              {node.kind === 'task' ? (
                <TaskRow
                  block={node.block}
                  task={node.task}
                  atRisk={node.atRisk}
                  gettingClose={node.gettingClose}
                  first={first}
                  isLocked={stakedTaskIdSet.has(node.task.id)}
                  isOverlapping={section.overlapIds.has(node.block.id)}
                  listHex={node.task.listId ? listColorById[node.task.listId] : undefined}
                  onPress={onBlockPress}
                />
              ) : (
                <EventRow event={node.event} first={first} onPress={onEventPress} />
              )}
            </React.Fragment>
          )
        })}
        {nowIndex === section.nodes.length ? <NowDivider time={now} /> : null}
      </View>
    </Animated.View>
  )
}

/** Thin blue divider plus "Now · 5:20 PM", today's live chronological marker. */
function NowDivider({ time }: { time: number }) {
  const label = `Now · ${formatClockTime(time)}`
  return (
    <View
      className="flex-row items-center gap-2 py-1.5"
      accessibilityRole="text"
      accessibilityLabel={label}
    >
      <View className="flex-1 h-[2px] rounded-full bg-primary-600" />
      <Text variant="captionMedium" className="text-primary-600" style={tabularNums}>
        {label}
      </Text>
      <View className="flex-1 h-[2px] rounded-full bg-primary-600" />
    </View>
  )
}

interface ChipData {
  label: string
  icon?: keyof typeof Ionicons.glyphMap
  tone?: 'neutral' | 'warning'
}

/** A single sunken-pill chip, 13px/500, optionally leading with a small glyph. */
function Chip({ label, icon, tone = 'neutral' }: ChipData) {
  const bg = tone === 'warning' ? 'bg-warning-100' : 'bg-neutral-100'
  const fg = tone === 'warning' ? 'text-warning-700' : 'text-neutral-600'
  return (
    <View className={`flex-row items-center gap-1 rounded-full px-2 py-1 ${bg}`}>
      {icon ? (
        <Ionicons
          name={icon}
          size={11}
          color={tone === 'warning' ? colors.light.warningStrong : colors.light.textSecondary}
        />
      ) : null}
      <Text variant="captionMedium" className={fg}>
        {label}
      </Text>
    </View>
  )
}

/**
 * A scheduled task block's row: list-colour dot, fixed-width start time,
 * title, then a chip row underneath for steps / Locked / At risk / Overlaps.
 * Tap, complete, and navigation behavior is unchanged: `onPress` still just
 * opens the block's detail, same as before this restyle.
 */
function TaskRow({
  block,
  task,
  atRisk,
  gettingClose,
  first,
  isLocked,
  isOverlapping,
  listHex,
  onPress,
}: {
  block: ScheduledBlock
  task: Task
  atRisk: boolean
  gettingClose: boolean
  first: boolean
  isLocked: boolean
  isOverlapping: boolean
  listHex: string | undefined
  onPress?: (block: ScheduledBlock) => void
}) {
  const steps = remainingSteps(task)
  const done = block.status === 'done'
  const dotColor = useMemo(() => listDotColor(listHex), [listHex])
  const timeLabel = useMemo(() => formatClockTime(block.start), [block.start])

  const chips: ChipData[] = []
  if (steps > 0) chips.push({ label: `${steps} ${steps === 1 ? 'step' : 'steps'}` })
  if (isLocked) chips.push({ label: 'Locked', icon: 'lock-closed' })
  if (atRisk) chips.push({ label: 'At risk', tone: 'warning' })
  else if (gettingClose) chips.push({ label: 'Getting close', tone: 'warning' })
  if (isOverlapping) chips.push({ label: 'Overlaps' })

  const a11yLabel = [
    task.title,
    `scheduled at ${timeLabel}`,
    steps > 0 ? `${steps} ${steps === 1 ? 'step' : 'steps'}` : null,
    isLocked ? 'locked' : null,
    atRisk ? 'at risk' : gettingClose ? 'getting close' : null,
    isOverlapping ? 'overlaps another item' : null,
    done ? 'done' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <View className={first ? undefined : 'border-t border-neutral-200'}>
      <PressableScale
        onPress={onPress ? () => onPress(block) : undefined}
        haptic="light"
        className="flex-row items-center gap-2.5 min-h-11 py-2"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens details"
      >
        {/* List-colour dot, the semantic signal a11y carries via the label above. */}
        <View
          style={{ backgroundColor: dotColor }}
          className="w-2 h-2 rounded-full"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        <Text
          variant="captionMedium"
          className="text-neutral-600"
          style={[tabularNums, { width: TIME_COL_WIDTH }]}
        >
          {timeLabel}
        </Text>

        <Text
          variant="bodyMedium"
          numberOfLines={1}
          className={`flex-1 ${done ? 'text-neutral-500 line-through' : ''}`}
        >
          {task.title}
        </Text>
      </PressableScale>

      {chips.length > 0 ? (
        <View style={{ marginLeft: CHIP_INDENT }} className="flex-row flex-wrap gap-1.5 pb-2">
          {chips.map((chip) => (
            <Chip key={chip.label} {...chip} />
          ))}
        </View>
      ) : null}
    </View>
  )
}

/**
 * A fixed CalEvent's row, using the same shell as {@link TaskRow} (list-colour
 * dot, time, title) so the two read as one list, distinguished by a "Fixed
 * event" chip (and "All day" too, for an all-day span) rather than a special
 * shape, per the reference's unified row template.
 */
function EventRow({
  event,
  first,
  onPress,
}: {
  event: CalEvent
  first: boolean
  onPress?: (event: CalEvent) => void
}) {
  const timeLabel = useMemo(
    () => (event.allDay ? '' : formatClockTime(event.start)),
    [event.allDay, event.start]
  )
  const a11yLabel = `Event: ${event.title}${event.allDay ? ', all day' : `, ${timeLabel}`}`

  return (
    <View className={first ? undefined : 'border-t border-neutral-200'}>
      <PressableScale
        onPress={onPress ? () => onPress(event) : undefined}
        haptic="light"
        className="flex-row items-center gap-2.5 min-h-11 py-2"
        accessibilityRole="button"
        accessibilityLabel={a11yLabel}
        accessibilityHint="Opens details"
      >
        <View
          style={{ backgroundColor: listColors.slate.bar }}
          className="w-2 h-2 rounded-full"
          accessibilityElementsHidden
          importantForAccessibility="no"
        />

        <Text
          variant="captionMedium"
          className="text-neutral-600"
          style={[tabularNums, { width: TIME_COL_WIDTH }]}
        >
          {timeLabel}
        </Text>

        <Text variant="bodyMedium" numberOfLines={1} className="flex-1">
          {event.title}
        </Text>
      </PressableScale>

      <View style={{ marginLeft: CHIP_INDENT }} className="flex-row flex-wrap gap-1.5 pb-2">
        {event.allDay ? <Chip label="All day" /> : null}
        <Chip label="Fixed event" />
      </View>
    </View>
  )
}
