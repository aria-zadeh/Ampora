/**
 * Paywall / subscription screen — Phase 7 (PRD FR-88), freemium pass
 * (App Store Guideline 3.1.2 compliance).
 *
 * Ampora itself is free to use. This screen sells entitlement to the two
 * paid surfaces only, the app-lock and AI calls (the freemium split lives in
 * `core/entitlements.ts`), a 2-week free trial then a monthly or annual
 * plan, billed via the store (Apple In-App Purchase / Google Play Billing)
 * through RevenueCat. This screen:
 * - Before any trial: presents the value, two premium plan cards, and a
 *   single primary "Start free trial" that begins the 14-day LOCAL trial
 *   (core/subscription `startTrial`, persisted via `updateSettings`, the
 *   trial itself is never a store transaction).
 * - During/after the trial: shows "N days left" (or "Trial ended") and lets
 *   the user pick a plan to continue, which goes through
 *   `getPurchaseStrategy().purchase()` (core/iap), a real transaction on a
 *   native build, a no-op "succeeds" scaffold everywhere else (Windows/web).
 * - Lapsed (a former paid subscription ended): a "Welcome back" variant of
 *   the same plan picker, never re-offering a free trial.
 * - Active: a calm "you're all set" confirmation.
 *
 * Always dismissible (`core/subscription.ts#isPaywallDismissible`, always
 * true, unit-tested there). This screen is no longer an access gate,
 * `app/_layout.tsx`'s routing gate never redirects here, a lapsed trial or
 * subscription lands the user back in the app instead. The header X, the
 * swipe gesture, and the Android hardware back key all work in every state.
 *
 * App Store Guideline 3.1.2: the price per plan, the billing period, the
 * length of the free trial, and plain text that the plan renews
 * automatically until cancelled are all rendered directly under the primary
 * buy button, visible without scrolling past it, in every state, not only
 * pre-trial and not only in Settings or legal text (see `PLAN_PRICING`
 * below, one named constant rather than scattered literals). Tappable Terms
 * of Use and Privacy Policy links sit near "Restore purchases", which
 * itself stays available in every non-active state, the recovery path for
 * someone who already paid (e.g. reinstalled) but whose local state does
 * not know it yet. Apple requires "Restore purchases" for every
 * subscription app.
 *
 * No dark patterns: trial state and what happens at its end are stated
 * plainly, a cancelled purchase is a normal outcome (never a crash or an
 * alarming error), and a lapsed subscriber is never nudged back into
 * "start your free trial" copy. Projects/premium accent (the `accent` token,
 * `utils/design-tokens.ts`) sets the tone. RN + NativeWind, web-export safe.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Platform, BackHandler } from 'react-native'
import { router, useNavigation } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
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
import { Text as UIText } from '@/components/ui/Text'
import { Button } from '@/components/ui/Button'
import { PressableScale } from '@/components/ui/PressableScale'
import { FeatureShell } from '@/components/ui/FeatureShell'
import { useSettingsStore } from '@/store/settingsStore'
import {
  startTrial,
  trialDaysLeft,
  isActive,
  isPaywallDismissible,
  TRIAL_DURATION_DAYS,
} from '@/core/subscription'
import { getPurchaseStrategy, PLACEHOLDER_OFFERINGS, type IapOffering, type IapPlan } from '@/core/iap'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { DURATIONS, SPRINGS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'
import { useThemeColors } from '@/hooks/useThemeColors'

// ---------------------------------------------------------------------------
// Plan display shape. Populated from `PurchaseStrategy.getOfferings()` (real
// store prices on a native build, PLACEHOLDER_OFFERINGS everywhere else and
// as the fallback whenever a native build has no offerings configured yet).
// ---------------------------------------------------------------------------

interface Plan {
  key: IapPlan
  title: string
  price: string
  cadence: string
  /** Small note under the price (e.g. per-month equivalent for annual). From `IapOffering.priceNote`. */
  note?: string
  /** Highlight the recommended plan. Ampora's own merchandising choice, not store data. */
  best?: boolean
}

/**
 * Canonical subscription pricing (App Store Guideline 3.1.2: the exact price
 * and billing period must be visible at the point of purchase, not only in
 * Settings or legal text). One named constant so these numbers are never
 * scattered across the screen as bare literals.
 *
 * `core/iap`'s `PLACEHOLDER_OFFERINGS` is separate scaffolding for the
 * not-yet-wired real purchase call (`strategy.purchase()`) and predates this
 * pricing decision, its own annual placeholder ($74.99) is not what is
 * actually charged. This is the real price, the plan cards, the compliance
 * line, and the trial disclaimer all read from it, so the screen can never
 * show two different numbers for the same plan.
 */
const PLAN_PRICING: Record<IapPlan, { amount: number; price: string; period: 'month' | 'year' }> = {
  monthly: { amount: 6.99, price: '$6.99', period: 'month' },
  annual: { amount: 39.99, price: '$39.99', period: 'year' },
}

const ANNUAL_MONTHLY_EQUIVALENT = PLAN_PRICING.annual.amount / 12
const ANNUAL_SAVINGS_PCT = Math.round(
  (1 - PLAN_PRICING.annual.amount / (PLAN_PRICING.monthly.amount * 12)) * 100,
)

function toDisplayPlan(offering: IapOffering): Plan {
  const isAnnual = offering.plan === 'annual'
  const pricing = PLAN_PRICING[offering.plan]
  return {
    key: offering.plan,
    title: isAnnual ? 'Annual' : 'Monthly',
    price: pricing.price,
    cadence: `per ${pricing.period}`,
    note: isAnnual
      ? `$${ANNUAL_MONTHLY_EQUIVALENT.toFixed(2)}/mo · save ~${ANNUAL_SAVINGS_PCT}%`
      : undefined,
    best: isAnnual,
  }
}

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
  const theme = useThemeColors()
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
              color={selected ? theme.accent : theme.textDisabled}
            />
            <Text
              className={`ml-1.5 text-caption ${
                selected ? 'font-medium text-accent-700' : 'text-neutral-500'
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
  const theme = useThemeColors()
  const navigation = useNavigation()

  const subscription = useSettingsStore((s) => s.settings.subscription)
  const updateSettings = useSettingsStore((s) => s.updateSettings)

  // Stable for the life of the screen — the strategy is chosen once by the
  // (compile-time) feature flag, never mid-session.
  const strategy = useMemo(() => getPurchaseStrategy(), [])

  const active = useMemo(() => isActive(subscription), [subscription])
  const daysLeft = useMemo(() => trialDaysLeft(subscription), [subscription])

  // A brand-new install: status is still the bare default `{ status: 'trial' }`
  // with no `trialEndsAt` yet (ensureTrialStarted stamps one almost
  // immediately at bootstrap, so this is normally a very short-lived state,
  // but the paywall must still render something sensible if it is ever hit).
  const neverTrialed = subscription.status === 'trial' && subscription.trialEndsAt == null
  // A former subscriber whose paid plan ended. Never shown "start a free
  // trial" again — that would silently reset real subscription state.
  const lapsed = subscription.status === 'lapsed'
  const showTrialChip = subscription.status === 'trial' && subscription.trialEndsAt != null

  // Always true (freemium split, see the file docstring). Kept as a computed
  // value, rather than inlining `true` below, so the header X, the swipe
  // gesture, the hardware back key, and `close()` all stay driven by one
  // named rule that lives in core/subscription.ts and is independently
  // tested there (core/__tests__/subscription.test.ts), not by reading this
  // screen's JSX.
  const dismissible = useMemo(() => isPaywallDismissible(subscription), [subscription])

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

  // Offerings: real store prices on a native build, PLACEHOLDER_OFFERINGS
  // everywhere else (the mock resolves the same placeholders itself, so this
  // default only actually matters while the real fetch is in flight or if it
  // fails / comes back empty).
  const [offerings, setOfferings] = useState<IapOffering[]>(PLACEHOLDER_OFFERINGS)
  const [selectedPlan, setSelectedPlan] = useState<IapPlan>('annual')
  const [purchaseState, setPurchaseState] = useState<'idle' | 'purchasing' | 'restoring'>('idle')
  const [purchaseMessage, setPurchaseMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    strategy
      .init()
      .then(() => strategy.getOfferings())
      .then((fetched) => {
        if (cancelled || fetched.length === 0) return
        setOfferings(fetched)
      })
      .catch(() => {
        // Never surface this — PLACEHOLDER_OFFERINGS is already the default.
      })
    return () => {
      cancelled = true
    }
  }, [strategy])

  const displayPlans = useMemo(() => offerings.map(toDisplayPlan), [offerings])
  // Always sourced from PLAN_PRICING, not the (placeholder) offerings list,
  // so the compliance line below can never disagree with the plan cards.
  const selectedPricing = PLAN_PRICING[selectedPlan]

  // Keep the selection valid if the fetched offerings don't include whatever
  // was pre-selected (e.g. only one plan is configured in the dashboard).
  useEffect(() => {
    if (displayPlans.length === 0) return
    if (displayPlans.some((p) => p.key === selectedPlan)) return
    setSelectedPlan(displayPlans[0].key)
  }, [displayPlans, selectedPlan])

  // Keep the platform's own swipe-to-dismiss gesture in sync with
  // `dismissible` (always true today, see the file docstring) — this covers
  // the modal presentation's own interactive gesture, the header X (below)
  // covers the tap path. `useNavigation()`'s default `ScreenOptions` generic
  // is `{}` (no static navigator context here), so `setOptions` is narrowed
  // locally rather than relying on an inferred shape.
  useEffect(() => {
    ;(navigation as unknown as { setOptions: (options: { gestureEnabled?: boolean }) => void }).setOptions({
      gestureEnabled: dismissible,
    })
  }, [navigation, dismissible])

  // Swallow the Android hardware back button while non-dismissible.
  // `gestureEnabled` above only covers the swipe-back gesture, not the
  // physical/software back key, so without this a lapsed Android user could
  // still pop this screen straight back into the app (FR-88). Android only:
  // iOS has no hardware back button (its only back path is the swipe gesture,
  // already covered above), and react-native-web's `BackHandler` shim logs a
  // `console.error` on every `addEventListener` call, so registering there
  // would just spam the console for a listener that can never fire. Re-adds
  // whenever `dismissible` flips, via the dependency array, and always
  // removes the listener on unmount or before re-adding — never leaks.
  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (dismissible) return false // not our concern — let default back proceed
      return true // swallow: no way to pop this screen with the hardware key
    })
    return () => sub.remove()
  }, [dismissible])

  // Dismiss (back if we can, else fall into the app). Only ever wired to a
  // visible control while `dismissible` is true; the internal guard is
  // defense in depth, not the only thing standing between a lapsed user and
  // the rest of the app.
  const close = () => {
    if (!dismissible) return
    if (router.canGoBack()) router.back()
    else router.replace('/(tabs)')
  }

  // Proceed INTO the app. Used after the entitlement changes (trial started,
  // a purchase/restore succeeded, or dev bypass) — the paywall is a routing
  // gate this build, so it always lands in the tabs rather than trying to pop
  // back to the gate.
  const proceed = () => {
    router.replace('/(tabs)')
  }

  // Begin the free trial (pre-trial state only). Persists via updateSettings.
  // This is never a store transaction — the 14-day trial is a local grant,
  // matching FR-88 exactly; only what happens AFTER it ends touches billing.
  const handleStartTrial = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    updateSettings({ subscription: startTrial() })
    proceed()
  }

  // Buy the selected plan through the active PurchaseStrategy. A cancelled
  // sheet is a normal outcome (no message, no error haptic) — only a genuine
  // failure gets a calm, non-alarming inline note. Never throws/crashes.
  const handlePurchase = async () => {
    if (purchaseState !== 'idle') return
    setPurchaseMessage(null)
    setPurchaseState('purchasing')
    const result = await strategy.purchase(selectedPlan)

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      // Trust the strategy's own read of what was actually granted when it
      // has one; fall back to the requested plan so a successful purchase
      // can never leave the user stuck on a stale/lapsed local state (an
      // unknown entitlement must never lock a paying user out).
      const entitlement = await strategy.getEntitlement().catch(() => null)
      updateSettings({
        subscription: entitlement ?? { ...subscription, status: 'active', plan: selectedPlan },
      })
      setPurchaseState('idle')
      proceed()
      return
    }

    setPurchaseState('idle')
    if (result.reason === 'cancelled') return // normal outcome, not an error
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
    setPurchaseMessage("That didn't go through. Please try again.")
  }

  // Apple requires every subscription app to offer this — a reinstalling
  // user must never be asked to pay twice. Available regardless of
  // `dismissible`: this is the recovery path OUT of a lapsed/ended state, not
  // a way to skip paying.
  const handleRestore = async () => {
    if (purchaseState !== 'idle') return
    setPurchaseMessage(null)
    setPurchaseState('restoring')
    const result = await strategy.restore()

    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
      const entitlement = await strategy.getEntitlement().catch(() => null)
      updateSettings({ subscription: entitlement ?? { ...subscription, status: 'active' } })
      setPurchaseState('idle')
      proceed()
      return
    }

    setPurchaseState('idle')
    setPurchaseMessage('No previous purchase found for this account.')
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
        <PaywallHeader onClose={close} dismissible={dismissible} />
        <View className="flex-1 items-center justify-center px-8">
          <View className="h-16 w-16 items-center justify-center rounded-full bg-accent-100">
            <Ionicons name="checkmark-circle" size={36} color={theme.accent} />
          </View>
          <Heading size="h2" className="mt-5 text-center">
            You're all set
          </Heading>
          <Text className="mt-2 text-center text-body text-neutral-500">
            Your {subscription.plan ?? 'Ampora'} subscription is active. Thanks for
            being here.
          </Text>
          <View className="mt-8 w-full max-w-xs">
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
  // Pre-trial, in-trial, trial-ended, or lapsed — the sell.
  // -------------------------------------------------------------------------
  const showStartTrialCta = neverTrialed

  let heroTitle: string
  let heroSubtitle: string
  if (neverTrialed) {
    heroTitle = 'Ampora, free for 2 weeks'
    heroSubtitle = 'Try everything free for 14 days. Keep it for the price of a couple coffees a month.'
  } else if (lapsed) {
    heroTitle = 'Welcome back'
    heroSubtitle = 'Your subscription has ended. Choose a plan to continue.'
  } else if (daysLeft > 0) {
    heroTitle = 'Keep your momentum'
    heroSubtitle = 'Pick a plan whenever you like — nothing changes until your trial ends.'
  } else {
    heroTitle = 'Keep your momentum'
    heroSubtitle = 'Your free trial has ended. Choose a plan to keep going.'
  }

  const busy = purchaseState !== 'idle'

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Accent wash behind the hero — flat surface, the source has no gradients */}
      <View
        pointerEvents="none"
        className="absolute top-0 left-0 right-0 bg-accent-100"
        style={{ height: 280 }}
      />

      <PaywallHeader onClose={close} dismissible={dismissible} />

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
            <Ionicons name="sparkles" size={26} color={theme.accent} />
          </View>

          {showTrialChip ? (
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
          ) : null}

          <Heading size="h1" className={showTrialChip ? 'mt-3' : 'mt-5'}>
            {heroTitle}
          </Heading>
          <Text className="mt-2 text-body-lg text-neutral-500">{heroSubtitle}</Text>
        </Animated.View>

        {/* Value list */}
        <Animated.View
          entering={
            reduceMotion ? undefined : FadeInDown.delay(60).duration(DURATIONS.base)
          }
          className="mt-7 rounded-2xl border border-neutral-200 bg-white p-5"
        >
          {VALUE_POINTS.map((point, i) => (
            <View
              key={point.text}
              className={`flex-row items-center ${i === 0 ? '' : 'mt-3.5'}`}
            >
              <View className="h-8 w-8 items-center justify-center rounded-full bg-accent-100">
                <Ionicons name={point.icon} size={16} color={theme.accent} />
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
            {displayPlans.map((plan) => (
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
          {showStartTrialCta ? (
            <Button
              title="Start free trial"
              variant="primaryBlue"
              size="lg"
              onPress={handleStartTrial}
              accessibilityLabel="Start your 14-day free trial"
            />
          ) : (
            <Button
              title={`Continue with ${selectedPlan === 'annual' ? 'Annual' : 'Monthly'}`}
              variant="primaryBlue"
              size="lg"
              loading={purchaseState === 'purchasing'}
              disabled={purchaseState === 'restoring'}
              onPress={handlePurchase}
              accessibilityLabel={`Continue with the ${selectedPlan} plan`}
            />
          )}

          {purchaseMessage ? (
            <Text
              accessibilityLiveRegion="polite"
              className="mt-3 text-center text-caption text-neutral-500"
            >
              {purchaseMessage}
            </Text>
          ) : null}

          {/* App Store Guideline 3.1.2: price, billing period, trial length
              (when a trial is actually on offer), and plain auto-renewal
              language, always visible right under the buy button, in every
              state, never gated behind extra taps or only in Settings/legal
              text. Sourced from PLAN_PRICING (file top), never a scattered
              literal. */}
          <UIText variant="caption" className="mt-3 text-center text-neutral-500">
            {showStartTrialCta
              ? `${TRIAL_DURATION_DAYS} days free, then ${selectedPricing.price} per ${selectedPricing.period}. Renews automatically until cancelled.`
              : `${selectedPricing.price} per ${selectedPricing.period}. Renews automatically until cancelled.`}
          </UIText>

          {showTrialChip && daysLeft > 0 ? (
            <PressableScale
              onPress={close}
              haptic="light"
              className="mt-3 min-h-11 items-center justify-center py-2"
              accessibilityRole="button"
              accessibilityLabel="Maybe later"
            >
              <Text className="text-label font-medium text-neutral-500">Maybe later</Text>
            </PressableScale>
          ) : null}

          {/* Restore purchases (Apple requires this for every subscription
              app). Available in every non-active state regardless of
              `dismissible` — this is the recovery path for someone who
              already paid but whose local state does not know it yet, never
              a way to skip paying. */}
          <PressableScale
            onPress={handleRestore}
            haptic="selection"
            disabled={busy}
            className="mt-3 min-h-11 items-center justify-center py-2"
            accessibilityRole="button"
            accessibilityLabel="Restore purchases"
            accessibilityHint="Checks for a previous purchase on this account and unlocks it if found"
            accessibilityState={{ busy: purchaseState === 'restoring' }}
          >
            <Text
              className={`text-label font-medium ${busy ? 'text-neutral-300' : 'text-neutral-500'}`}
            >
              {purchaseState === 'restoring' ? 'Restoring…' : 'Restore purchases'}
            </Text>
          </PressableScale>

          {/* App Store Guideline 3.1.2 also expects Terms of Use / Privacy
              Policy reachable from the purchase screen itself, not only from
              Settings. `/legal/terms` and `/legal/privacy` are a concurrent
              change, this just links the paths. */}
          <View className="mt-3 flex-row items-center justify-center gap-2">
            <PressableScale
              onPress={() => router.push('/legal/terms')}
              haptic="light"
              className="min-h-12 items-center justify-center px-2"
              accessibilityRole="link"
              accessibilityLabel="Terms of Use"
            >
              <UIText variant="captionMedium" className="text-neutral-500 underline">
                Terms of Use
              </UIText>
            </PressableScale>
            <UIText variant="caption" className="text-neutral-300">
              ·
            </UIText>
            <PressableScale
              onPress={() => router.push('/legal/privacy')}
              haptic="light"
              className="min-h-12 items-center justify-center px-2"
              accessibilityRole="link"
              accessibilityLabel="Privacy Policy"
            >
              <UIText variant="captionMedium" className="text-neutral-500 underline">
                Privacy Policy
              </UIText>
            </PressableScale>
          </View>
        </Animated.View>

        {/* IAP honesty note */}
        <Text className="mt-6 text-center text-caption text-neutral-500 leading-5">
          {strategy.kind === 'native'
            ? 'Billing runs through the App Store. Cancel anytime in your device Settings.'
            : Platform.OS === 'ios'
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
              <Ionicons name="construct-outline" size={16} color={theme.textSecondary} />
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

const VALUE_POINTS: { icon: keyof typeof Ionicons.glyphMap; text: string }[] = [
  { icon: 'sparkles-outline', text: 'A plan that adapts to how you actually work' },
  { icon: 'flash-outline', text: 'A 2-minute first move for every task' },
  { icon: 'lock-closed-outline', text: 'Lock your own apps behind the work' },
  { icon: 'folder-open-outline', text: 'Projects: files, chat, and progress in one place' },
]

/** Shared close (X) header for the paywall. Renders an inert same-size spacer instead of a button when not dismissible (FR-88) — never a dead tap target. */
function PaywallHeader({ onClose, dismissible }: { onClose: () => void; dismissible: boolean }) {
  const theme = useThemeColors()
  return (
    <View className="flex-row items-center justify-end px-4 pb-1 pt-1">
      {dismissible ? (
        <PressableScale
          onPress={onClose}
          haptic="light"
          className="h-11 w-11 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={theme.textSecondary} />
        </PressableScale>
      ) : (
        <View className="h-11 w-11" />
      )}
    </View>
  )
}
