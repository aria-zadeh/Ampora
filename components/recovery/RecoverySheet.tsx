/**
 * RecoverySheet — the "Catch me up" rebuild flow (PRD FR-60, §8.6, §9.5.9).
 * Ampora Phase 6.
 *
 * Opened from the RecoveryBanner. Shows the deterministic rebuild PREVIEW
 * (`core/recovery.buildRecoveryPreview`): which moot past-due items get
 * cleared, which now-urgent tasks get bumped to the front, and how much of the
 * upcoming week gets replanned. One tap — "Rebuild my week" — applies the
 * drops + bumps and reruns the scheduler, then shows the exact success line
 * "Rebuilt your week."
 *
 * Wellbeing stance (FR-60): ZERO shame. No miss counts, no broken-streak
 * language, nothing that blames. Just: here's the plan, one tap, moving on.
 * Everything is reversible-feeling and calm. Reduce-motion aware. RN +
 * NativeWind, web-export safe.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, Modal, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Heading } from '@/components/ui/Heading'
import { Text as UIText } from '@/components/ui/Text'
import { DURATIONS } from '@/utils/motion'
import { tabularNums } from '@/utils/design-tokens'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useTaskStore, selectAllTasks } from '@/store/taskStore'
import { useScheduleStore, selectAllBlocks } from '@/store/scheduleStore'
import { useRecoveryStore } from '@/store/recoveryStore'
import { buildRecoveryPreview, type RecoveryPreview } from '@/core/recovery'
import type { Task } from '@/types'

export interface RecoverySheetProps {
  visible: boolean
  /** Close the sheet without rebuilding. */
  onClose: () => void
}

/**
 * Priority we raise a bumped task to so the engine front-loads it. The task
 * model treats higher `priority` as more urgent (4 = Urgent in the editor), so
 * we ensure a bumped task is at least this urgent without clobbering an
 * already-higher value.
 */
const BUMP_PRIORITY_FLOOR = 4

export function RecoverySheet({ visible, onClose }: RecoverySheetProps) {
  const reduceMotion = useReduceMotion()

  const tasks = useTaskStore(useShallow(selectAllTasks))
  const blocks = useScheduleStore(useShallow(selectAllBlocks))

  const applyRecoveryDrop = useTaskStore((s) => s.applyRecoveryDrop)
  const updateTask = useTaskStore((s) => s.updateTask)
  const dismissBanner = useRecoveryStore((s) => s.dismissBanner)

  // Whether we've applied the rebuild (drives the success state).
  const [rebuilt, setRebuilt] = useState(false)

  // The preview is computed once per open against the state at open time. We
  // snapshot `now` in the memo so the preview is stable while the sheet is up.
  const preview: RecoveryPreview = useMemo(() => {
    if (!visible) return { drops: [], bumps: [], rebuildCount: 0, summary: '' }
    return buildRecoveryPreview(tasks, blocks, Date.now())
    // Recompute only when the sheet (re)opens — not on every task keystroke
    // behind it. `visible` is the intended trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible])

  // Reset the success state whenever the sheet reopens.
  React.useEffect(() => {
    if (visible) setRebuilt(false)
  }, [visible])

  const handleRebuild = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {})

    // 1) Resolve every past-due item. A non-recurring moot task (or a
    // recurring one whose series has ended) is dropped outright. A missed
    // RECURRING occurrence is instead ADVANCED past the miss — the series
    // continues with its rule (and count, for a count-limited series)
    // rolled forward; only the missed instance goes away (FR-16). Deleting
    // the whole task here would destroy the user's recurring commitment over
    // a single missed day, so this always goes through
    // `applyRecoveryDrop` — never a direct `deleteTask` — which is the one
    // place that decides delete-vs-advance (`core/recovery.ts`).
    for (const drop of preview.drops) {
      applyRecoveryDrop(drop)
    }

    // 2) Bump now-urgent tasks to the front by raising their priority floor.
    const now = Date.now()
    for (const bump of preview.bumps) {
      const current = bump.task.priority ?? 0
      if (current < BUMP_PRIORITY_FLOOR) {
        updateTask(bump.task.id, { priority: BUMP_PRIORITY_FLOOR })
      }
      // Clear any stale startAfter that would hold an urgent task in the future.
      if (bump.task.startAfter != null && bump.task.startAfter > now) {
        updateTask(bump.task.id, { startAfter: undefined })
      }
    }

    // 3) Replan the week. The task-store writes above have already fired the
    // debounced recompute trigger, but we recompute explicitly so the result
    // is ready the instant the sheet closes (FR-60 "accepts in one tap").
    useScheduleStore.getState().recompute()

    setRebuilt(true)
    // The banner has served its purpose — stand it down for this session.
    dismissBanner()
  }

  const handleClose = () => {
    Haptics.selectionAsync().catch(() => {})
    onClose()
  }

  const nothingToDo =
    preview.drops.length === 0 && preview.bumps.length === 0 && preview.rebuildCount === 0

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={handleClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={
                reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)
              }
              className="rounded-t-sheet bg-surface"
            >
              <SafeAreaView edges={['bottom']}>
                {/* Grabber: 40x4, bg-line, rounded-xxs (bottom-sheet spec). */}
                <View className="items-center pt-3">
                  <View className="h-1 w-10 rounded-xxs bg-line" />
                </View>

                {rebuilt ? (
                  <SuccessBody onDone={handleClose} reduceMotion={reduceMotion} />
                ) : (
                  <PreviewBody
                    preview={preview}
                    nothingToDo={nothingToDo}
                    onRebuild={handleRebuild}
                    onClose={handleClose}
                  />
                )}
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// Preview body
// ---------------------------------------------------------------------------

function PreviewBody({
  preview,
  nothingToDo,
  onRebuild,
  onClose,
}: {
  preview: RecoveryPreview
  nothingToDo: boolean
  onRebuild: () => void
  onClose: () => void
}) {
  const theme = useThemeColors()
  return (
    <>
      <View className="px-6 pt-5">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-100">
          <Ionicons name="sparkles-outline" size={26} color={theme.primary} />
        </View>
        {/* h1/28pt, two-line hero heading — measured off recovery-mode.pdf
            (bumped up from h2/22pt, the rest of the copy is unchanged). */}
        <Heading size="h1" className="mt-4">
          Let&apos;s catch you up
        </Heading>
        <Text className="mt-2 text-body text-neutral-600 leading-6">
          {nothingToDo
            ? "You're already on track — there's nothing to clear. Want a fresh plan anyway?"
            : preview.summary}
        </Text>
      </View>

      {!nothingToDo && (
        <ScrollView
          className="mt-5 max-h-72"
          contentContainerClassName="px-5"
          showsVerticalScrollIndicator={false}
        >
          {preview.drops.length > 0 && (
            <PreviewGroup
              icon="checkmark-done-outline"
              tint={theme.successAccent}
              tintBg="bg-success-100"
              title="Clearing what's behind you"
              caption="These are past their moment. We'll take them off your plate."
              tasks={preview.drops.map((d) => d.task)}
              kind="drop"
            />
          )}
          {preview.bumps.length > 0 && (
            <PreviewGroup
              icon="arrow-up-circle-outline"
              tint={theme.primary}
              tintBg="bg-primary-100"
              title="Moving these up front"
              caption="These matter most right now, so they come first."
              tasks={preview.bumps.map((b) => b.task)}
              kind="bump"
            />
          )}
          {preview.rebuildCount > 0 && (
            <View className="mb-2 mt-2 flex-row items-center gap-2 px-1">
              <Ionicons name="calendar-outline" size={16} color={theme.textMuted} />
              <Text className="text-caption text-neutral-500">
                {preview.rebuildCount} other{' '}
                {preview.rebuildCount === 1 ? 'task' : 'tasks'} replanned around your week.
              </Text>
            </View>
          )}
        </ScrollView>
      )}

      {/* Actions */}
      <View className="mt-6 gap-3 px-5 pb-2">
        {/* Plain centered label, no icon — matches every measured primary CTA
            in this round (task-capture's "Commit to Schedule", voice-capture's
            "Confirm & Add Intent"): none of them carry a leading icon. */}
        <Button
          title="Rebuild my week"
          variant="primaryBlue"
          size="lg"
          onPress={onRebuild}
          accessibilityLabel="Rebuild my week"
          accessibilityHint="Clears past-due items, moves urgent tasks up, and replans your schedule"
        />
        <Pressable
          onPress={onClose}
          className="min-h-11 items-center justify-center rounded-md active:opacity-60"
          accessibilityRole="button"
          accessibilityLabel="Not now"
        >
          <Text className="text-label font-medium text-neutral-500">Not now</Text>
        </Pressable>
      </View>
    </>
  )
}

/**
 * "Overdue by 1d" / "Overdue by 4h" — a pure display computation off the
 * task's own `due`, mirroring the small local date-math helpers already used
 * in `BrainDumpSheet` (no store read, no side effect, nothing persisted).
 */
function formatOverdueLabel(due: number, now: number): string {
  const hours = Math.max(0, now - due) / (1000 * 60 * 60)
  if (hours < 1) return 'Overdue'
  if (hours < 24) return `Overdue by ${Math.round(hours)}h`
  return `Overdue by ${Math.round(hours / 24)}d`
}

/**
 * A dropped (past-due, moot) task: title + a right-aligned overdue label, in
 * its own bordered card, matching the recovery-mode source's stack of
 * individual task cards rather than the old single merged list.
 *
 * The source also shows three per-card actions (Reschedule / Shrink task /
 * Drop). They are deliberately NOT rendered. This sheet's model is
 * preview-then-apply-all through "Rebuild my week", and no per-item reschedule
 * or shrink flow exists to call — `applyRecoveryDrop` is applied as part of the
 * whole rebuild, not per row. Drawing three buttons that look live and do
 * nothing is worse than omitting them, so they wait until someone builds the
 * behaviour behind them.
 */
function OverdueTaskCard({ task }: { task: Task }) {
  const overdue = task.due != null ? formatOverdueLabel(task.due, Date.now()) : null
  return (
    <Card variant="default">
      <View className="flex-row items-start justify-between gap-3">
        <UIText variant="body" className="flex-1 text-neutral-900" numberOfLines={1}>
          {task.title}
        </UIText>
        {overdue ? (
          <UIText variant="meta" className="text-danger-600" style={tabularNums}>
            {overdue}
          </UIText>
        ) : null}
      </View>
    </Card>
  )
}

/**
 * A bumped (now-urgent) task — a simpler card with no overdue framing: it is
 * being moved UP, not dropped, so the drop-card's actions don't apply here.
 */
function BumpTaskCard({ task }: { task: Task }) {
  return (
    <Card variant="default">
      <UIText variant="body" className="text-neutral-900" numberOfLines={1}>
        {task.title}
      </UIText>
    </Card>
  )
}

/** A grouped list of tasks in the preview, with an icon + explanatory caption. */
function PreviewGroup({
  icon,
  tint,
  tintBg,
  title,
  caption,
  tasks,
  kind,
}: {
  icon: keyof typeof Ionicons.glyphMap
  tint: string
  tintBg: string
  title: string
  caption: string
  tasks: Task[]
  /** Which per-task card to render — only a "drop" is framed as overdue. */
  kind: 'drop' | 'bump'
}) {
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center gap-2 px-1">
        <View className={`h-7 w-7 items-center justify-center rounded-full ${tintBg}`}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <Text className="text-label font-semibold text-neutral-900">{title}</Text>
      </View>
      <Text className="mb-3 px-1 text-caption text-neutral-500">{caption}</Text>
      {/* Each task is its own bordered card, not rows merged into one shared
          container — matches the recovery-mode source's stack of cards. */}
      <View className="gap-3">
        {tasks.map((task) =>
          kind === 'drop' ? (
            <OverdueTaskCard key={task.id} task={task} />
          ) : (
            <BumpTaskCard key={task.id} task={task} />
          ),
        )}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Success body
// ---------------------------------------------------------------------------

function SuccessBody({
  onDone,
  reduceMotion,
}: {
  onDone: () => void
  reduceMotion: boolean
}) {
  const theme = useThemeColors()
  return (
    <View className="items-center px-6 pt-6">
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
        className="h-16 w-16 items-center justify-center rounded-full bg-success-100"
      >
        <Ionicons name="checkmark-circle" size={34} color={theme.successAccent} />
      </Animated.View>

      {/* Exact success copy required by FR-60. */}
      <Heading size="h2" className="mt-5 text-center">
        Rebuilt your week.
      </Heading>
      <Text className="mt-2 text-center text-body text-neutral-600 leading-6">
        Fresh start. Your plan is ready whenever you are.
      </Text>

      <View className="mt-8 w-full gap-3 px-0 pb-2">
        <Button
          title="See my plan"
          variant="primaryBlue"
          size="lg"
          onPress={onDone}
          accessibilityLabel="See my plan"
        />
      </View>
    </View>
  )
}
