/**
 * Full settings screen — Phase 7 (PRD §8.11 / FR-65: "expose every configurable
 * value"). The Profile tab keeps the everyday controls (appearance, name, busy
 * times, focus DNA, stakes, calendar sync); this screen collects the remaining
 * §8.11 surface that would crowd Profile:
 * - Scheduling defaults (buffers, split + min/max block, workload, cutoff).
 * - Notifications (cadence, quiet-hours summary).
 * - Data & account (export, delete all, sign out).
 *
 * Reached via the "More settings" link on Profile. Each section renders its own
 * grouped cards (like StakesSettings), so they sit under section headers rather
 * than a shared shell. Calm entrance stagger, reduce-motion aware. RN +
 * NativeWind, web-export safe.
 */

import React from 'react'
import { View, Text, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import Animated, { FadeInDown } from 'react-native-reanimated'

import { Heading } from '@/components/ui/Heading'
import { PressableScale } from '@/components/ui/PressableScale'
import { SchedulingSettings } from '@/components/settings/SchedulingSettings'
import { NotificationSettings } from '@/components/settings/NotificationSettings'
import { DataSettings } from '@/components/settings/DataSettings'
import { DURATIONS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'

/** A titled section wrapper with a staggered entrance. */
function Section({
  title,
  index,
  children,
}: {
  title: string
  index: number
  children: React.ReactNode
}) {
  const reduceMotion = useReduceMotion()
  return (
    <Animated.View
      entering={
        reduceMotion ? undefined : FadeInDown.delay(index * 60).duration(DURATIONS.base)
      }
      className="mt-8"
    >
      <Heading size="h3" className="mb-3">
        {title}
      </Heading>
      {children}
    </Animated.View>
  )
}

export default function AllSettingsScreen() {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Header with back */}
      <View className="flex-row items-center px-5 pb-2 pt-2">
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color="#1C1917" />
        </PressableScale>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="pt-2"
        >
          <Text className="text-overline font-semibold uppercase tracking-wide text-primary-600">
            Settings
          </Text>
          <Heading size="h1" className="mt-1">
            More settings
          </Heading>
          <Text className="mt-1.5 text-body text-neutral-500">
            Fine-tune how Ampora plans, nudges, and stores your work.
          </Text>
        </Animated.View>

        <Section title="Scheduling" index={1}>
          <SchedulingSettings />
        </Section>

        <Section title="Notifications" index={2}>
          <NotificationSettings />
        </Section>

        <Section title="Data & account" index={3}>
          <DataSettings />
        </Section>
      </ScrollView>
    </View>
  )
}
