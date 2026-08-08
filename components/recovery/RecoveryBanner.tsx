/**
 * RecoveryBanner, the calm "you're behind, want a hand?" banner (PRD FR-60,
 * §8.6). Ampora Phase 6.
 *
 * Shown on Home / Calendar when a lapse has been detected (2+ days of missed
 * scheduled blocks) and the user hasn't dismissed the offer this session. It is
 * a gentle offer, never an accusation: "You have {N} unfinished blocks. Want me
 * to rebuild?" with a "Catch me up" button that opens the RecoverySheet, and a
 * quiet dismiss.
 *
 * Wellbeing stance (FR-60): ZERO shame. We state a neutral fact (unfinished
 * blocks) and offer help. No streaks, no "you missed", no red alarm styling,
 * this uses the calm primary tint, not the danger ramp.
 *
 * Self-contained: it reads the recovery flag + missed-block count and owns the
 * RecoverySheet it opens. Drop it near the top of a screen's scroll content and
 * it renders nothing until there's actually a lapse. Reduce-motion aware. RN +
 * NativeWind, web-export safe.
 */

import React, { useMemo, useState } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

import { PressableScale } from '@/components/ui/PressableScale'
import { RecoverySheet } from '@/components/recovery/RecoverySheet'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useRecoveryStore, selectShowRecoveryBanner } from '@/store/recoveryStore'
import { useScheduleStore, selectAllBlocks } from '@/store/scheduleStore'
import { countMissedBlocks } from '@/core/recovery'

export function RecoveryBanner() {
  const reduceMotion = useReduceMotion()

  const show = useRecoveryStore(selectShowRecoveryBanner)
  const dismissBanner = useRecoveryStore((s) => s.dismissBanner)

  const blocks = useScheduleStore(useShallow(selectAllBlocks))
  const missedCount = useMemo(() => countMissedBlocks(blocks, Date.now()), [blocks])

  const [sheetOpen, setSheetOpen] = useState(false)

  // Nothing to show, render null so the banner takes zero space when on track.
  if (!show || missedCount === 0) return null

  return (
    <>
      <Animated.View
        entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
        className="rounded-2xl border border-primary-200 bg-primary-50 p-4"
        style={shadows.sm}
        accessibilityRole="summary"
        accessibilityLabel={`You have ${missedCount} unfinished ${
          missedCount === 1 ? 'block' : 'blocks'
        }. Want a hand rebuilding your plan?`}
      >
        <View className="flex-row items-start gap-3">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-100">
            <Ionicons name="refresh-outline" size={18} color="#2563EB" />
          </View>
          <View className="flex-1">
            <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
              Fresh start
            </Text>
            {/* `leading-5` removed: 15px body belongs in the scale's 22px */}
            {/* box, and Lexend needs the room Inter did not. */}
            <Text className="mt-0.5 text-body font-medium text-primary-900">
              You have {missedCount} unfinished {missedCount === 1 ? 'block' : 'blocks'}. Want me to
              rebuild?
            </Text>
          </View>

          {/* Quiet dismiss, always available, never demands engagement. */}
          <Pressable
            onPress={dismissBanner}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
            className="active:opacity-60"
          >
            <Ionicons name="close" size={18} color="#60A5FA" />
          </Pressable>
        </View>

        <View className="mt-3 flex-row items-center gap-3">
          <PressableScale
            onPress={() => setSheetOpen(true)}
            haptic="light"
            className="flex-row items-center gap-1.5 rounded-full bg-primary-600 px-4 py-2.5"
            style={shadows.xs}
            accessibilityRole="button"
            accessibilityLabel="Catch me up"
            accessibilityHint="Opens a preview of a rebuilt plan"
          >
            <Ionicons name="sparkles-outline" size={16} color="#FFFFFF" />
            <Text className="text-label font-semibold text-white">Catch me up</Text>
          </PressableScale>
        </View>
      </Animated.View>

      <RecoverySheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  )
}
