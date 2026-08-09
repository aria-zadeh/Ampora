/**
 * TaskActionSheet, the Tasks list's long-press context menu (Phase 3,
 * Todoist-grade affordances).
 *
 * Visual pattern CLONED from `components/calendar/BlockActionSheet.tsx`'s
 * bottom-sheet + ActionRow (grabber, title header, rounded rows with a tinted
 * leading icon), that file is Phase-2 owned and is left untouched. This is a
 * new, task-scoped sheet: Edit, Complete/Reopen, Schedule tomorrow, Move to
 * list, Put on the line, Delete.
 *
 * Presentational only, every action is a callback the caller wires to the
 * existing task/list stores, so this file stays store-agnostic like its
 * calendar counterpart.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, Modal, Pressable, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'

import { Heading } from '@/components/ui/Heading'
import { PressableScale } from '@/components/ui/PressableScale'
import { shadows, colors } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import type { List, Task } from '@/types'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface TaskActionSheetProps {
  visible: boolean
  /** The task the actions target. Null while closed (sheet renders nothing). */
  task: Task | null
  /** Lists available for the "Move to list" picker. */
  lists: List[]
  onClose: () => void
  onEdit: () => void
  /** Toggles complete/reopen depending on the task's current status. */
  onToggleComplete: () => void
  onScheduleTomorrow: () => void
  onMoveToList: (listId: string | undefined) => void
  onDelete: () => void
  /**
   * "Put something on the line" (Ignition stake). Omitted entirely, no row
   * rendered, when the caller has no route to send the user to, per the
   * "omit gracefully" instruction.
   */
  onPutOnTheLine?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TaskActionSheet({
  visible,
  task,
  lists,
  onClose,
  onEdit,
  onToggleComplete,
  onScheduleTomorrow,
  onMoveToList,
  onDelete,
  onPutOnTheLine,
}: TaskActionSheetProps) {
  const reduceMotion = useReduceMotion()
  const [pickingList, setPickingList] = useState(false)

  if (!task) return null

  const isDone = task.status === 'done'
  const title = task.title || 'Untitled'

  const handleClose = () => {
    setPickingList(false)
    onClose()
  }

  const handleEdit = () => {
    onEdit()
    handleClose()
  }

  const handleToggleComplete = () => {
    Haptics.notificationAsync(
      isDone ? Haptics.NotificationFeedbackType.Warning : Haptics.NotificationFeedbackType.Success,
    ).catch(() => {})
    onToggleComplete()
    handleClose()
  }

  const handleScheduleTomorrow = () => {
    Haptics.selectionAsync().catch(() => {})
    onScheduleTomorrow()
    handleClose()
  }

  const handlePickList = (listId: string | undefined) => {
    Haptics.selectionAsync().catch(() => {})
    onMoveToList(listId)
    handleClose()
  }

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    onDelete()
    handleClose()
  }

  const handlePutOnTheLine = () => {
    if (!onPutOnTheLine) return
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})
    onPutOnTheLine()
    handleClose()
  }

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
        accessibilityLabel="Dismiss"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100"
              style={shadows.xl}
            >
              <SafeAreaView edges={['bottom']}>
                {/* Grabber */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300" />
                </View>

                {/* Header: task title */}
                <View className="flex-row items-start justify-between px-5 pb-1 pt-3">
                  <View className="flex-1 pr-3">
                    <Heading size="h3" numberOfLines={2}>
                      {title}
                    </Heading>
                    {isDone && (
                      <Text className="mt-1 text-caption text-neutral-500">Completed</Text>
                    )}
                  </View>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color={colors.light.textSecondary} />
                  </Pressable>
                </View>

                <View className="px-5 pb-4 pt-3">
                  {pickingList ? (
                    <ListPicker
                      lists={lists}
                      currentListId={task.listId}
                      onPick={handlePickList}
                      onBack={() => setPickingList(false)}
                    />
                  ) : (
                    <View className="gap-2">
                      <ActionRow
                        icon="pencil-outline"
                        label="Edit"
                        onPress={handleEdit}
                      />
                      <ActionRow
                        icon={isDone ? 'refresh-outline' : 'checkmark-circle-outline'}
                        label={isDone ? 'Mark incomplete' : 'Mark complete'}
                        onPress={handleToggleComplete}
                        tint={isDone ? 'neutral' : 'success'}
                      />
                      {!isDone && (
                        <ActionRow
                          icon="calendar-outline"
                          label="Schedule tomorrow"
                          onPress={handleScheduleTomorrow}
                          tint="primary"
                        />
                      )}
                      <ActionRow
                        icon="folder-outline"
                        label="Move to list"
                        onPress={() => setPickingList(true)}
                      />
                      {onPutOnTheLine && !isDone && (
                        <ActionRow
                          icon="lock-closed-outline"
                          label="Put on the line"
                          blurb="Lock a leisure app behind this task"
                          onPress={handlePutOnTheLine}
                          tint="primary"
                        />
                      )}
                      <ActionRow
                        icon="trash-outline"
                        label="Delete"
                        onPress={handleDelete}
                        tint="danger"
                      />
                    </View>
                  )}
                </View>
              </SafeAreaView>
            </Animated.View>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  )
}

// ---------------------------------------------------------------------------
// List picker (inline, replaces the action list when active)
// ---------------------------------------------------------------------------

function ListPicker({
  lists,
  currentListId,
  onPick,
  onBack,
}: {
  lists: List[]
  currentListId?: string
  onPick: (listId: string | undefined) => void
  onBack: () => void
}) {
  const options = useMemo(
    () => [{ id: undefined as string | undefined, name: 'No list', color: colors.light.textDisabled }, ...lists],
    [lists],
  )

  return (
    <View>
      <Pressable
        onPress={onBack}
        hitSlop={8}
        className="mb-2 flex-row items-center gap-1 self-start px-1 py-1"
        accessibilityRole="button"
        accessibilityLabel="Back to actions"
      >
        <Ionicons name="chevron-back" size={16} color={colors.light.primary} />
        <Text className="text-caption font-medium text-primary-600">Back</Text>
      </Pressable>
      <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
        <View className="gap-2">
          {options.map((opt) => {
            const selected = opt.id === currentListId
            return (
              <PressableScale
                key={opt.id ?? 'none'}
                onPress={() => onPick(opt.id)}
                haptic={false}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  selected ? 'border-primary-300 bg-primary-50' : 'border-neutral-200 bg-white'
                }`}
                style={selected ? undefined : shadows.xs}
                accessibilityRole="button"
                accessibilityLabel={opt.name}
                accessibilityState={{ selected }}
              >
                <View
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: opt.color }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text className="flex-1 text-body-lg font-medium text-neutral-900">{opt.name}</Text>
                {selected && <Ionicons name="checkmark" size={18} color={colors.light.primary} />}
              </PressableScale>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Action row, same tint vocabulary as BlockActionSheet's ActionRow.
// ---------------------------------------------------------------------------

type Tint = 'neutral' | 'primary' | 'success' | 'danger'

const TINT_STYLES: Record<Tint, { icon: string; iconBg: string; text: string }> = {
  neutral: { icon: colors.light.textStrong, iconBg: 'bg-neutral-100', text: 'text-neutral-900' },
  primary: { icon: colors.light.primary, iconBg: 'bg-primary-100', text: 'text-neutral-900' },
  success: { icon: colors.light.successStrong, iconBg: 'bg-success-100', text: 'text-neutral-900' },
  danger: { icon: colors.light.dangerStrong, iconBg: 'bg-danger-100', text: 'text-danger-700' },
}

function ActionRow({
  icon,
  label,
  blurb,
  onPress,
  tint = 'neutral',
}: {
  icon: keyof typeof Ionicons.glyphMap
  label: string
  blurb?: string
  onPress: () => void
  tint?: Tint
}) {
  const t = TINT_STYLES[tint]
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
      style={shadows.xs}
      accessibilityRole="button"
      accessibilityLabel={blurb ? `${label}. ${blurb}` : label}
    >
      <View className={`h-10 w-10 items-center justify-center rounded-full ${t.iconBg}`}>
        <Ionicons name={icon} size={20} color={t.icon} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${t.text}`}>{label}</Text>
        {blurb ? (
          <Text className="mt-0.5 text-caption text-neutral-500" numberOfLines={2}>
            {blurb}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  )
}
