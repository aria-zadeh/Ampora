/**
 * TaskActionSheet — the Tasks list's long-press context menu (Phase 3,
 * Todoist-grade affordances).
 *
 * Visual pattern CLONED from `components/calendar/BlockActionSheet.tsx`'s
 * bottom-sheet + ActionRow (grabber, title header, rounded rows with a tinted
 * leading icon) — that file is Phase-2 owned and is left untouched. This is a
 * new, task-scoped sheet: Edit, Complete/Reopen, Schedule tomorrow, Move to
 * list, Put on the line, Delete.
 *
 * Presentational only — every action is a callback the caller wires to the
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
import { shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useThemeColors } from '@/hooks/useThemeColors'
import { useColorScheme } from 'nativewind'
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
   * "Put something on the line" (Ignition stake). Omitted entirely — no row
   * rendered — when the caller has no route to send the user to, per the
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
  // Ionicons `color` takes a literal and cannot take a `dark:` class, so the
  // close glyph resolves the active scheme here. Everything else in this
  // component is className-driven and uses `dark:` variants directly.
  const theme = useThemeColors()
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
      {/* The scrim is an opacity class, not a colour decision, so it needs no
          `dark:` variant: black at 40% darkens whatever is behind it in
          either theme, and on the dark canvas it still separates the sheet
          from the page (#0C0A09 dims to #070605). */}
      <Pressable
        className="flex-1 bg-black/40"
        onPress={handleClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
      >
        <View className="flex-1 justify-end">
          <Pressable onPress={() => {}}>
            {/* The sheet is the canvas row and its rows below are the card
                row, mirroring the light structure exactly (neutral-100 sheet
                holding white rows becomes a neutral-950 sheet holding
                neutral-900 rows). `shadows.xl` is left in place but does
                effectively nothing on a near-black canvas — the scrim above
                is what lifts the sheet off the page in dark mode. */}
            <Animated.View
              entering={reduceMotion ? FadeIn.duration(DURATIONS.base) : FadeInUp.duration(DURATIONS.base)}
              className="rounded-t-3xl bg-neutral-100 dark:bg-neutral-950"
              style={shadows.xl}
            >
              <SafeAreaView edges={['bottom']}>
                {/* Grabber — the cheatsheet's borderStrong row, decorative. */}
                <View className="items-center pt-3">
                  <View className="h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
                </View>

                {/* Header: task title */}
                <View className="flex-row items-start justify-between px-5 pb-1 pt-3">
                  <View className="flex-1 pr-3">
                    <Heading size="h3" numberOfLines={2}>
                      {title}
                    </Heading>
                    {/* 13px caption, exactly the tier the bespoke dark
                        textMuted value is audited for (3.65:1, doc 02
                        §14.6). Written as the arbitrary literal the
                        cheatsheet prescribes, never `dark:text-neutral-500`
                        (3.19:1). The word "Completed" is the state, not the
                        tone, so nothing rides on colour here. */}
                    {isDone && (
                      <Text className="mt-1 text-caption text-neutral-500 dark:text-[#78716C]">
                        Completed
                      </Text>
                    )}
                  </View>
                  <Pressable
                    onPress={handleClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white dark:bg-neutral-900"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    {/* textSecondary is 7.06:1 on the light disc and 6.91:1
                        on the dark one, both clear of the 3:1 a 20px glyph
                        owes and of the 4.5:1 bar besides. */}
                    <Ionicons name="close" size={20} color={theme.textSecondary} />
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
  // Ionicons `color` takes a literal, so these resolve the active scheme.
  // The two accent glyphs here also need the scheme NAME, not just the token
  // set, because they step to a different RAMP STEP on dark rather than to
  // the same token's dark value (see `accentGlyph` below).
  const theme = useThemeColors()
  const { colorScheme } = useColorScheme()

  /**
   * Accent glyph tone for this picker, stepped one lighter on dark.
   *
   * This is the §1.8 accent-text rule applied to a glyph that genuinely
   * needs it rather than to one that does not. The chevron pairs with a
   * primary-600 label that HAS to step (13px text owes 4.5:1 and primary-600
   * is 3.38:1 on dark), so leaving the glyph behind would split one control
   * across two blues. The checkmark is the harder case: it sits on the
   * SELECTED row's fill, which is neutral-800 in dark, and primary-600 there
   * measures 2.93:1 — under even the 3:1 a glyph owes, so it is a real
   * failure, not a preference. primary-400 restores it to 5.97:1 on that
   * fill and 7.77:1 on the sheet behind the chevron. Light is untouched.
   */
  const accentGlyph = colorScheme === 'dark' ? theme.primaryLight : theme.primary

  const options = useMemo(
    () => [{ id: undefined as string | undefined, name: 'No list', color: theme.textDisabled }, ...lists],
    [lists, theme.textDisabled],
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
        <Ionicons name="chevron-back" size={16} color={accentGlyph} />
        <Text className="text-caption font-medium text-primary-600 dark:text-primary-400">Back</Text>
      </Pressable>
      <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
        <View className="gap-2">
          {options.map((opt) => {
            const selected = opt.id === currentListId
            return (
              /* The unselected row is the plain card + border pair. The
                 SELECTED row is the one surface in this file that cannot be
                 a straight token swap: light marks it with a pale primary-50
                 tint, and the ramp has no dark counterpart to that (the
                 nearest, primary-900, is a saturated navy slab, not a
                 tint, and would read as a filled button). So dark keeps the
                 selection in the blue family where it belongs by lifting the
                 row one surface step to `elevated` and putting the accent on
                 the BORDER instead: primary-500 measures 4.12:1 against that
                 fill and 5.37:1 against the sheet, clear of the 3:1 a
                 boundary owes, where primary-600 would have been 2.93:1. The
                 checkmark and `accessibilityState.selected` carry the state
                 regardless, so it is never colour alone. */
              <PressableScale
                key={opt.id ?? 'none'}
                onPress={() => onPick(opt.id)}
                haptic={false}
                className={`flex-row items-center gap-3 rounded-xl border px-4 py-3 ${
                  selected
                    ? 'border-primary-300 bg-primary-50 dark:border-primary-500 dark:bg-neutral-800'
                    : 'border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900'
                }`}
                style={selected ? undefined : shadows.xs}
                accessibilityRole="button"
                accessibilityLabel={opt.name}
                accessibilityState={{ selected }}
              >
                {/* Persisted List identity colour for real lists (never
                    theme-resolved, it is matched by equality elsewhere), and
                    `textDisabled` for the synthetic "No list" option, which
                    is decorative and hidden from the accessibility tree. */}
                <View
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: opt.color }}
                  accessibilityElementsHidden
                  importantForAccessibility="no"
                />
                <Text className="flex-1 text-body-lg font-medium text-neutral-900 dark:text-neutral-50">
                  {opt.name}
                </Text>
                {selected && <Ionicons name="checkmark" size={18} color={accentGlyph} />}
              </PressableScale>
            )
          })}
        </View>
      </ScrollView>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Action row — same tint vocabulary as BlockActionSheet's ActionRow.
// ---------------------------------------------------------------------------

type Tint = 'neutral' | 'primary' | 'success' | 'danger'

/**
 * Class half of the tint vocabulary. Split from the icon half below because
 * the two halves answer to different rules.
 *
 * The three semantic `iconBg`s are small pastel tint chips: an OPAQUE
 * `*-100` fill with a `*Strong` glyph on it, self-contained and already
 * audited (primary 4.24:1, success 4.57:1, danger 3.95:1 — all over the 3:1
 * a glyph on its own tint owes), so none of them takes a `dark:` variant.
 * `neutral` is not a tint but the neutral ramp, so it flips, and it takes
 * the elevated step rather than the cheatsheet's canvas row so the chip stays
 * visible on the neutral-900 row it sits inside.
 *
 * `danger`'s LABEL is the one entry that had to move: danger-700 measures
 * 2.70:1 on the dark row, well under the 4.5:1 this 16px line owes, so dark
 * steps to danger-500 (4.65:1) exactly as doc 02 §1.8 prescribes for accent
 * text. Note it is the label that steps and NOT the glyph beside it, because
 * the glyph rides the opaque danger-100 chip whose contrast never moved.
 */
const TINT_STYLES: Record<Tint, { iconBg: string; text: string }> = {
  neutral: { iconBg: 'bg-neutral-100 dark:bg-neutral-800', text: 'text-neutral-900 dark:text-neutral-50' },
  primary: { iconBg: 'bg-primary-100', text: 'text-neutral-900 dark:text-neutral-50' },
  success: { iconBg: 'bg-success-100', text: 'text-neutral-900 dark:text-neutral-50' },
  danger: { iconBg: 'bg-danger-100', text: 'text-danger-700 dark:text-danger-500' },
}

/**
 * Glyph half. Ionicons `color` takes a literal, so it resolves through the
 * active scheme's token set rather than a class.
 *
 * Only `neutral` actually changes value: it is the one glyph sitting on a
 * surface that flips (textStrong, 9.50:1 on the light chip and 11.72:1 on
 * the dark one). The other three are pinned to tokens doc 02 §14.1 keeps
 * identical in both themes, so reading them through `theme` documents the
 * intent without moving a pixel — and it must stay that way, since the tint
 * chips under them do not move either.
 */
function tintIcon(tint: Tint, theme: ReturnType<typeof useThemeColors>): string {
  switch (tint) {
    case 'primary':
      return theme.primary
    case 'success':
      return theme.successStrong
    case 'danger':
      return theme.dangerStrong
    default:
      return theme.textStrong
  }
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
  const theme = useThemeColors()
  return (
    <PressableScale
      onPress={onPress}
      haptic={false}
      className="flex-row items-center gap-3 rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900 px-4 py-3"
      style={shadows.xs}
      accessibilityRole="button"
      accessibilityLabel={blurb ? `${label}. ${blurb}` : label}
    >
      <View className={`h-10 w-10 items-center justify-center rounded-full ${t.iconBg}`}>
        <Ionicons name={icon} size={20} color={tintIcon(tint, theme)} />
      </View>
      <View className="flex-1">
        <Text className={`text-body-lg font-medium ${t.text}`}>{label}</Text>
        {/* 13px caption, the tier the bespoke dark textMuted value is
            audited for (3.65:1, doc 02 §14.6), spelled as the literal the
            cheatsheet prescribes rather than `dark:text-neutral-500`. */}
        {blurb ? (
          <Text className="mt-0.5 text-caption text-neutral-500 dark:text-[#78716C]" numberOfLines={2}>
            {blurb}
          </Text>
        ) : null}
      </View>
    </PressableScale>
  )
}
