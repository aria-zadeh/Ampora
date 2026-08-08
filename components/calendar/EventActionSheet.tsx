/**
 * EventActionSheet, the fixed-Event counterpart to `BlockActionSheet`
 * (PRD FR-1, FR-28; `docs/01_PRD.md` §8.6 "Tap a block opens a bottom sheet
 * with Complete, Edit, Delete").
 *
 * Tapping an Event block on the calendar opens this. The two sources behave
 * very differently on purpose:
 *
 *   • `source: 'local'`, created inside Ampora, so it is fully ours: Edit
 *     (opens `AddEventModal` prefilled) and Delete are offered, matching the
 *     Task block sheet's bar (no confirmation dialog, a haptic is the only
 *     ceremony, see `BlockActionSheet`'s `handleDelete`).
 *   • Anything else (`google` / `apple` / `outlook`), read from the device
 *     calendar by `services/calendarSync.ts`, which never writes back
 *     (FR-22 puts write-back out of scope for launch). Pretending these are
 *     editable here would silently fail or, worse, diverge from the real
 *     event. Instead the sheet says plainly where the event actually lives.
 *
 * Presentational + store-agnostic, exactly like `BlockActionSheet`: every
 * mutation is a callback the caller wires to `scheduleStore`.
 */

import React from 'react'
import { View, Text, Modal, Pressable } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated'

import { Heading } from '@/components/ui/Heading'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { ActionRow } from './BlockActionSheet'
import { formatBlockTimeRange } from './hours'
import type { CalEvent } from '@/types'

/**
 * Human-readable provider name for the "synced from X" message. Exported so
 * `UnschedulableFixSheet` (FR-20's "remove a blocking all-day event" remedy)
 * can name the same provider when a blocking event turns out to be
 * device-synced rather than local, instead of duplicating this map.
 */
export const SOURCE_LABEL: Record<CalEvent['source'], string> = {
  local: 'Ampora',
  google: 'Google Calendar',
  apple: 'Apple Calendar',
  outlook: 'Outlook',
}

export interface EventActionSheetProps {
  visible: boolean
  /** The event the sheet targets. Null while closed (sheet renders nothing). */
  event: CalEvent | null
  onClose: () => void
  /** Local events only: open the edit form prefilled with this event. */
  onEdit: () => void
  /** Local events only: delete the event outright. */
  onDelete: () => void
}

export function EventActionSheet({ visible, event, onClose, onEdit, onDelete }: EventActionSheetProps) {
  const reduceMotion = useReduceMotion()

  if (!event) return null

  const isLocal = event.source === 'local'
  const timeRange = formatBlockTimeRange(event.start, event.end)

  const handleEdit = () => {
    onEdit()
    onClose()
  }

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    onDelete()
    onClose()
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType={reduceMotion ? 'fade' : 'slide'}
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        className="flex-1 bg-black/40"
        onPress={onClose}
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

                {/* Header: event title + time range */}
                <View className="flex-row items-start justify-between px-5 pb-1 pt-3">
                  <View className="flex-1 pr-3">
                    <Heading size="h3" numberOfLines={2}>
                      {event.title}
                    </Heading>
                    <Text className="mt-1 text-caption text-neutral-500">{timeRange}</Text>
                  </View>
                  <Pressable
                    onPress={onClose}
                    hitSlop={8}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white"
                    style={shadows.xs}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={20} color="#57534E" />
                  </Pressable>
                </View>

                <View className="px-5 pb-4 pt-3">
                  {isLocal ? (
                    <View className="gap-2">
                      <ActionRow icon="create-outline" label="Edit event" onPress={handleEdit} tint="primary" />
                      <ActionRow icon="trash-outline" label="Delete event" onPress={handleDelete} tint="danger" />
                    </View>
                  ) : (
                    // Device-synced: clearly external, never pretending to be
                    // ours (FR-22, read-only, write-back out of scope).
                    <View
                      className="flex-row items-start gap-3 rounded-xl border border-neutral-200 bg-white px-4 py-3"
                      style={shadows.xs}
                      accessibilityLabel={`Synced from ${SOURCE_LABEL[event.source]}. Edit or delete it there.`}
                    >
                      <Ionicons name="link-outline" size={20} color="#6F6862" style={{ marginTop: 1 }} />
                      <Text className="flex-1 text-body text-neutral-600">
                        Synced from {SOURCE_LABEL[event.source]}. Edit or delete it there. Ampora only reads it
                        to keep this time free.
                      </Text>
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
