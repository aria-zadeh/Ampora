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
import { Heading } from '@/components/ui/Heading'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
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

  const deleteTask = useTaskStore((s) => s.deleteTask)
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

    // 1) Drop the moot / missed past-due items.
    for (const drop of preview.drops) {
      deleteTask(drop.task.id)
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
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={['bottom']}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
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
  return (
    <>
      <View className="px-6 pt-5">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-100">
          <Ionicons name="sparkles-outline" size={26} color="#2563EB" />
        </View>
        <Heading size="h2" className="mt-4">
          Let's catch you up
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
              tint="#16A34A"
              tintBg="bg-success-100"
              title="Clearing what's behind you"
              caption="These are past their moment. We'll take them off your plate."
              tasks={preview.drops.map((d) => d.task)}
            />
          )}
          {preview.bumps.length > 0 && (
            <PreviewGroup
              icon="arrow-up-circle-outline"
              tint="#2563EB"
              tintBg="bg-primary-100"
              title="Moving these up front"
              caption="These matter most right now, so they come first."
              tasks={preview.bumps.map((b) => b.task)}
            />
          )}
          {preview.rebuildCount > 0 && (
            <View className="mb-2 mt-2 flex-row items-center gap-2 px-1">
              <Ionicons name="calendar-outline" size={16} color="#71717A" />
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
        <Button
          title="Rebuild my week"
          variant="primaryBlue"
          size="lg"
          onPress={onRebuild}
          icon={<Ionicons name="refresh" size={18} color="#FFFFFF" />}
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

/** A grouped list of tasks in the preview, with an icon + explanatory caption. */
function PreviewGroup({
  icon,
  tint,
  tintBg,
  title,
  caption,
  tasks,
}: {
  icon: keyof typeof Ionicons.glyphMap
  tint: string
  tintBg: string
  title: string
  caption: string
  tasks: Task[]
}) {
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center gap-2 px-1">
        <View className={`h-7 w-7 items-center justify-center rounded-full ${tintBg}`}>
          <Ionicons name={icon} size={16} color={tint} />
        </View>
        <Text className="text-label font-semibold text-neutral-900">{title}</Text>
      </View>
      <Text className="mb-2 px-1 text-caption text-neutral-500">{caption}</Text>
      <View className="rounded-2xl border border-neutral-200 bg-white px-4" style={shadows.sm}>
        {tasks.map((task, i) => (
          <View
            key={task.id}
            className={`flex-row items-center py-3 ${
              i === tasks.length - 1 ? '' : 'border-b border-neutral-100'
            }`}
          >
            <Text className="flex-1 text-body text-neutral-800" numberOfLines={1}>
              {task.title}
            </Text>
          </View>
        ))}
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
  return (
    <View className="items-center px-6 pt-6">
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(DURATIONS.base)}
        className="h-16 w-16 items-center justify-center rounded-full bg-success-100"
      >
        <Ionicons name="checkmark-circle" size={34} color="#16A34A" />
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
