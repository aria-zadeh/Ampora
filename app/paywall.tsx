/**
 * Paywall / subscription screen — Phase 7 (PRD FR-88).
 *
 * Ampora is a paid app with a 2-week free trial, then a monthly or annual plan
 * (annual ~10% cheaper per month), billed via Apple In-App Purchase. This screen:
 * - Before trial: presents the value, two premium plan cards, and a single
 *   primary "Start free trial" that begins the 14-day trial (core/subscription
 *   `startTrial`, persisted via `updateSettings`).
 * - During trial: shows "N days left" and lets the user pick a plan to continue
 *   (or just close — this is a soft gate this build; core usage isn't blocked).
 * - Active: a calm "you're all set" confirmation.
 *
 * No real IAP library is wired (Apple IAP is a documented later step — see the
 * footnote). Choosing a plan records the intended plan and flips the local
 * subscription to 'active' as a scaffold so the rest of the app can read a
 * consistent entitlement state. Honest, non-pushy copy. Projects/premium accent
 * (#7C3AED) sets the tone. RN + NativeWind, web-export safe.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Platform } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated'

import { Heading } from '@/components/ui/Heading'
import { Button } from '@/components/ui/Button'
import { PressableScale } from '@/components/ui/PressableScale'
import { FeatureShell } from '@/components/ui/FeatureShell'
import { useSettingsStore } from '@/store/settingsStore'
import { startTrial, trialDaysLeft, isActive } from '@/core/subscription'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS, SPRINGS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'

// ---------------------------------------------------------------------------
// Plans + value list (illustrative pricing — real prices come from App Store
// Connect once IAP is wired; annual is ~10% cheaper per month per FR-88).
// ---------------------------------------------------------------------------

type PlanKey = 'monthly' | 'annual'

interface Plan {
  key: PlanKey
  title: string
  price: string
  cadence: string
  /** Small note under the price (e.g. per-month equivalent for annual). */
  note?: string
  /** Highlight the recommended plan. */
  best?: boolean
}

const PLANS: Plan[] = [
  {
    key: 'monthly',
    title: 'Monthly',
    price: '$6.99',
    cadence: 'per month',
  },
  {
    key: 'annual',
    title: 'Annual',
    price: '$74.99',
    cadence: 'per year',
    note: '$6.25/mo · save ~10%',
    best: true,
  },
]

const VALUE_POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'sparkles-outline', text: 'A plan that adapts to how you actually work' },
  { icon: 'flash-outline', text: 'A 2-minute first move for every task' },
  { icon: 'lock-closed-outline', text: 'Lock your own apps behind the work' },
  { icon: 'folder-open-outline', text: 'Projects: files, chat, and progress in one place' },
]

// ---------------------------------------------------------------------------
// Plan card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan
  selected: boolean
  onSelect: () => void
}) {
  return (
    <PressableScale
      onPress={onSelect}
      haptic="selection"
      className="flex-1"
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.title} plan, ${plan.price} ${plan.cadence}${
        plan.note ? `, ${plan.note}` : ''
      }${selected ? ', selected' : ''}`}
    >
      {/* Nested "focal card" treatment (doc 02 v3) — sanctioned use, plan
          cards are one of the few true focal moments in the app. The
          selection state rings the OUTER shell in accent when chosen, since
          FeatureShell's own bezel is a fixed neutral wash. */}
      <FeatureShell
        className={selected ? 'border-accent-600' : ''}
        style={shadows.sm}
      >
        <View className="p-4">
          <View className="flex-row items-center justify-between">
            <Text className="text-label font-semibold text-neutral-900">{plan.title}</Text>
            {plan.best ? (
              <View className="rounded-full bg-accent-100 px-2 py-0.5">
                <Text className="text-tiny font-semibold uppercase tracking-wide text-accent-700">
                  Best value
                </Text>
              </View>
            ) : null}
          </View>
          <Text className="mt-3 text-h2 font-bold tracking-tight-h2 text-neutral-900">
            {plan.price}
          </Text>
          <Text className="text-caption text-neutral-500">{plan.cadence}</Text>
          {plan.note ? (
            <Text className="mt-1 text-caption font-medium text-accent-700">{plan.note}</Text>
          ) : null}

          {/* Selection tick */}
          <View className="mt-3 flex-row items-center">
            <Ionicons
              name={selected ? 'checkmark-circle' : 'ellipse-outline'}
              size={18}
              color={selected ? '#7C3AED' : '#D4D4D8'}
            />
            <Text
              className={`ml-1.5 text-caption ${
                selected ? 'font-medium text-accent-700' : 'text-neutral-400'
              }`}
            >
              {selected ? 'Selected' : 'Choose'}
            </Text>
          </View>
        </View>
      </FeatureShell>
    </PressableScale>
  )
}

// ---------------------------------------------------------------------------
// Paywall
// ---------------------------------------------------------------------------

export default function PaywallScreen() {
  const insets = useSafeAreaInsets()
  const reduceMotion = useReduceMotion()

  const subscription = useSettingsStore((s) => s.settings.subscription)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  const active = useMemo(() => isActive(subscription), [subscription])
  const daysLeft = useMemo(() => trialDaysLeft(subscription), [subscription])
  const inTrial = subscription.status === 'trial'

  // Trial countdown chip tick — a quiet dip+settle whenever the days-left
  // count changes, so the number reads as alive rather than a static label.
  // Reduce-motion safe (skips straight to steady state).
  const prevDaysLeftRef = useRef(daysLeft)
  const chipScale = useSharedValue(1)
  const chipOpacity = useSharedValue(1)

  useEffect(() => {
    if (prevDaysLeftRef.current === daysLeft) return
    prevDaysLeftRef.current = daysLeft
    if (reduceMotion) return

    chipOpacity.value = withSequence(
      withTiming(0.5, { duration: 90 }),
      withTiming(1, { duration: 140 }),
    )
    chipScale.value = withSequence(
      withTiming(0.94, { duration: 90 }),
      withSpring(1, SPRINGS.tactile),
    )
  }, [daysLeft, reduceMotion, chipOpacity, chipScale])

  const chipAnimatedStyle = useAnimatedStyle(() => ({
    opacity: chipOpacity.value,
    transform: [{ scale: chipScale.value }],
  }))

  const [selectedPlan, setSelectedPlan] = useState<PlanKey>('annual')

  // Dismiss (back if we can, else fall into the app). Used by the X / "Maybe
  // later" when the user is just viewing this screen (e.g. opened from Profile).
  const close = () => {
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  // Proceed INTO the app. Used after the entitlement changes (trial started,
  // plan chosen, or dev bypass) — the paywall is a routing gate this build, so
  // it always lands in the tabs rather than trying to pop back to the gate.
  const proceed = () => {
    router.replace('/(tabs)')
  }

  // Begin the free trial (pre-trial state). Persists via updateSettings.
  const handleStartTrial = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    updateSettings({ subscription: startTrial() })
    proceed()
  }

  // Choose a plan to continue. No real IAP yet — scaffold the entitlement so the
  // app reads a consistent 'active' state; real purchasing is a later step.
  const handleContinue = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    updateSettings({
      subscription: { ...subscription, status: 'active', plan: selectedPlan },
    })
    proceed()
  }

  // Dev-only bypass: mark the subscription active and jump straight into the
  // app. Gated behind FEATURE_FLAGS.DEV_BYPASS_PAYWALL (which is __DEV__-gated),
  // so this control and its branch are stripped from production builds.
  const handleDevBypass = () => {
    Haptics.selectionAsync().catch(() => {})
    updateSettings({
      subscription: { ...subscription, status: 'active', plan: subscription.plan },
    })
    proceed()
  }

  // -------------------------------------------------------------------------
  // Already active — calm confirmation, nothing to sell.
  // -------------------------------------------------------------------------
  if (active && subscription.status === 'active') {
    return (
      <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
        <PaywallHeader onClose={close} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-100">
            <Ionicons name="checkmark-circle" size={36} color="#7C3AED" />
          </View>
          <Heading size="h2" className="mt-5 text-center">
            You're all set
          </Heading>
          <Text className="mt-2 text-center text-body text-neutral-500">
            Your {subscription.plan ?? 'Ampora'} subscription is active. Thanks for
            being here.
          </Text>
          <View className="mt-8 w-full max-w-[320px]">
            <Button
              title="Done"
              variant="primaryBlue"
              size="lg"
              onPress={close}
              accessibilityLabel="Close"
            />
          </View>
        </View>
      </View>
    )
  }

  // -------------------------------------------------------------------------
  // Pre-trial or in-trial — the sell.
  // -------------------------------------------------------------------------
  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Accent wash behind the hero */}
      <LinearGradient
        colors={['#F3EEFF', 'rgba(244,244,245,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280 }}
      />

      <PaywallHeader onClose={close} />

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-6 pb-10"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <Animated.View
          entering={reduceMotion ? undefined : FadeInDown.duration(DURATIONS.base)}
          className="pt-4"
        >
          <View className="h-14 w-14 items-center justify-center rounded-2xl bg-accent-100">
            <Ionicons name="sparkles" size={26} color="#7C3AED" />
          </View>

          {inTrial ? (
            <>
              <Animated.View
                style={chipAnimatedStyle}
                className="mt-5 self-start rounded-full bg-accent-100 px-3 py-1"
              >
                <Text className="text-caption font-semibold text-accent-700">
                  {daysLeft > 0
                    ? `Trial: ${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} left`
                    : 'Trial ended'}
                </Text>
              </Animated.View>
              <Heading size="h1" className="mt-3">
                Keep your momentum
              </Heading>
              <Text className="mt-2 text-body-lg text-neutral-500">
                {daysLeft > 0
                  ? 'Pick a plan whenever you like — nothing changes until your trial ends.'
                  : 'Your free trial has ended. Choose a plan to keep going.'}
              </Text>
            </>
          ) : (
            <>
              <Heading size="h1" className="mt-5">
                Ampora, free for 2 weeks
              </Heading>
              <Text className="mt-2 text-body-lg text-neutral-500">
                Try everything free for 14 days. Keep it for the price of a couple
                coffees a month.
              </Text>
            </>
          )}
        </Animated.View>

        {/* Value list */}
        <Animated.View
          entering={
            reduceMotion ? undefined : FadeInDown.delay(60).duration(DURATIONS.base)
          }
          className="mt-7 rounded-2xl border border-neutral-200 bg-white p-5"
          style={shadows.sm}
        >
          {VALUE_POINTS.map((point, i) => (
            <View
              key={point.text}
              className={`flex-row items-center ${i === 0 ? '' : 'mt-3.5'}`}
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-accent-100">
                <Ionicons name={point.icon} size={16} color="#7C3AED" />
              </View>
              <Text className="ml-3 flex-1 text-body text-neutral-800">{point.text}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Plans */}
        <Animated.View
          entering={
            reduceMotion ? undefined : FadeInDown.delay(120).duration(DURATIONS.base)
          }
          className="mt-7"
        >
          <Text className="mb-3 ml-1 text-overline font-semibold uppercase tracking-wide text-neutral-500">
            Choose a plan
          </Text>
          <View className="flex-row gap-3">
            {PLANS.map((plan) => (
              <PlanCard
                key={plan.key}
                plan={plan}
                selected={selectedPlan === plan.key}
                onSelect={() => setSelectedPlan(plan.key)}
              />
            ))}
          </View>
        </Animated.View>

        {/* Primary CTA */}
        <Animated.View
          entering={
            reduceMotion ? undefined : FadeInDown.delay(180).duration(DURATIONS.base)
          }
          className="mt-7"
        >
          {inTrial ? (
            <Button
              title={`Continue with ${selectedPlan === 'annual' ? 'Annual' : 'Monthly'}`}
              variant="primaryBlue"
              size="lg"
              onPress={handleContinue}
              accessibilityLabel={`Continue with the ${selectedPlan} plan`}
            />
          ) : (
            <Button
              title="Start free trial"
              variant="primaryBlue"
              size="lg"
              onPress={handleStartTrial}
              accessibilityLabel="Start your 14-day free trial"
            />
          )}

          {!inTrial ? (
            <Text className="mt-3 text-center text-caption text-neutral-500">
              14 days free, then {selectedPlan === 'annual' ? '$74.99/year' : '$6.99/month'}.
              Cancel anytime.
            </Text>
          ) : null}

          {inTrial && daysLeft > 0 ? (
            <PressableScale
              onPress={close}
              haptic="light"
              className="mt-3 items-center py-2"
              accessibilityRole="button"
              accessibilityLabel="Maybe later"
            >
              <Text className="text-label font-medium text-neutral-500">Maybe later</Text>
            </PressableScale>
          ) : null}
        </Animated.View>

        {/* IAP honesty note */}
        <Text className="mt-6 text-center text-caption text-neutral-400 leading-5">
          {Platform.OS === 'ios'
            ? 'Billing runs through the App Store. In-app purchase is being finalized — for now this sets up your plan locally.'
            : 'In-app purchase is being finalized. For now this sets up your plan locally so you can explore everything.'}
        </Text>

        {/* Dev-only bypass — stripped from production (FEATURE_FLAGS is __DEV__-gated). */}
        {FEATURE_FLAGS.DEV_BYPASS_PAYWALL ? (
          <View className="mt-6 border-t border-dashed border-neutral-200 pt-5">
            <PressableScale
              onPress={handleDevBypass}
              haptic="selection"
              className="flex-row items-center justify-center gap-2 rounded-xl border border-neutral-200 bg-white py-3"
              accessibilityRole="button"
              accessibilityLabel="Skip payment and enter the app (developer only)"
              accessibilityHint="Marks your subscription active locally without a purchase"
            >
              <Ionicons name="construct-outline" size={16} color="#71717A" />
              <Text className="text-label font-medium text-neutral-600">
                Skip / bypass payment (dev)
              </Text>
            </PressableScale>
          </View>
        ) : null}
      </ScrollView>
    </View>
  )
}

/** Shared close (X) header for the paywall. */
function PaywallHeader({ onClose }: { onClose: () => void }) {
  return (
    <View className="flex-row items-center justify-end px-4 pb-1 pt-1">
      <PressableScale
        onPress={onClose}
        haptic="light"
        className="h-11 w-11 items-center justify-center rounded-full"
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Ionicons name="close" size={24} color="#52525B" />
      </PressableScale>
    </View>
  )
}
