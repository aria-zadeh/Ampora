/**
 * Paywall / subscription screen — Phase 7 (PRD FR-88), real purchasing pass.
 *
 * Ampora is a paid app with a 2-week free trial, then a monthly or annual plan
 * (annual ~10% cheaper per month), billed via the store (Apple In-App
 * Purchase / Google Play Billing) through RevenueCat. This screen:
 * - Before any trial: presents the value, two premium plan cards, and a
 *   single primary "Start free trial" that begins the 14-day LOCAL trial
 *   (core/subscription `startTrial`, persisted via `updateSettings` — the
 *   trial itself is never a store transaction).
 * - During/after the trial: shows "N days left" (or "Trial ended") and lets
 *   the user pick a plan to continue, which now goes through
 *   `getPurchaseStrategy().purchase()` (core/iap) — a real transaction on a
 *   native build, a no-op "succeeds" scaffold everywhere else (Windows/web).
 * - Lapsed (a former paid subscription ended): a "Welcome back" variant of the
 *   same plan-picker, never re-offering a free trial.
 * - Active: a calm "you're all set" confirmation.
 *
 * FR-88: "Subscription state gates app access." The screen is dismissible
 * only while genuinely entitled (an active plan, or a trial with time left) —
 * `core/subscription.ts#isPaywallDismissible`, unit-tested there. On a lapsed
 * trial or a lapsed subscription there is no close (X) button, no
 * swipe-to-dismiss (`gestureEnabled: false`), and no "Maybe later" — the
 * paywall gate in `app/_layout.tsx` would otherwise be pure theater (a user
 * could dismiss once and never be sent back, since that gate's effect does
 * not re-run on navigation alone). A `BackHandler` listener additionally
 * swallows the ANDROID HARDWARE back key while non-dismissible, since
 * `gestureEnabled` only covers the swipe gesture — without it a lapsed
 * Android user could still pop this screen with the physical/software back
 * button. "Restore purchases" stays available in every non-active state
 * regardless of dismissibility — that is precisely the recovery path for
 * someone who already paid (e.g. reinstalled) but whose local state does not
 * know it yet, and it must never be blocked behind the same gate that blocks
 * a fresh purchase attempt.
 *
 * Closing every dismiss path must never trap anyone (too tight is worse than
 * too loose): while non-dismissible, a quiet "More settings" link also stays
 * available, routing to `/settings/all` where sign-out and data deletion
 * already live (§8.11) — so a user who cannot or will not pay can still leave
 * and delete their account, exactly as FR-88/NFR-6 require. Hidden when the
 * screen IS dismissible, since the ordinary tab bar already reaches Settings
 * in that case.
 *
 * No dark patterns: trial state and what happens at its end are stated
 * plainly, a cancelled purchase is a normal outcome (never a crash or an
 * alarming error), and a lapsed subscriber is never nudged back into
 * "start your free trial" copy. Projects/premium accent (#7C3AED) sets the
 * tone. RN + NativeWind, web-export safe.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, ScrollView, Platform, BackHandler } from 'react-native'
import { router, useNavigation } from 'expo-router'
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
import { startTrial, trialDaysLeft, isActive, isPaywallDismissible } from '@/core/subscription'
import { getPurchaseStrategy, PLACEHOLDER_OFFERINGS, type IapOffering, type IapPlan } from '@/core/iap'
import { FEATURE_FLAGS } from '@/constants/featureFlags'
import { shadows } from '@/utils/design-tokens'
import { DURATIONS, SPRINGS } from '@/utils/motion'
import { useReduceMotion } from '@/hooks/useReduceMotion'

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

function toDisplayPlan(offering: IapOffering): Plan {
  const isAnnual = offering.plan === 'annual'
  return {
    key: offering.plan,
    title: isAnnual ? 'Annual' : 'Monthly',
    price: offering.localizedPrice,
    cadence: isAnnual ? 'per year' : 'per month',
    note: offering.priceNote,
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
              color={selected ? '#7C3AED' : '#D7D3CC'}
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

  // FR-88: subscription state gates app access. Dismissible only while
  // genuinely entitled (an active plan, or a trial with time left) — see the
  // file docstring for why a lapsed trial/subscription must not be closeable.
  // Pure rule lives in core/subscription.ts so it is independently tested
  // (core/__tests__/subscription.test.ts) rather than only verified by
  // reading this screen's JSX.
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
  const selectedDisplayPlan = displayPlans.find((p) => p.key === selectedPlan)

  // Keep the selection valid if the fetched offerings don't include whatever
  // was pre-selected (e.g. only one plan is configured in the dashboard).
  useEffect(() => {
    if (displayPlans.length === 0) return
    if (displayPlans.some((p) => p.key === selectedPlan)) return
    setSelectedPlan(displayPlans[0].key)
  }, [displayPlans, selectedPlan])

  // Prevent the platform's own swipe-to-dismiss gesture while the paywall
  // must not be dismissible (FR-88) — the missing header X (below) covers the
  // tap path, this covers the modal presentation's own interactive gesture.
  // `useNavigation()`'s default `ScreenOptions` generic is `{}` (no static
  // navigator context here), so `setOptions` is narrowed locally rather than
  // relying on an inferred shape.
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
      {/* Accent wash behind the hero */}
      <LinearGradient
        colors={['#F3EEFF', 'rgba(244,244,245,0)']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        pointerEvents="none"
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 280 }}
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
            <Ionicons name="sparkles" size={26} color="#7C3AED" />
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

          {showStartTrialCta && selectedDisplayPlan ? (
            <Text className="mt-3 text-center text-caption text-neutral-500">
              14 days free, then {selectedDisplayPlan.price} {selectedDisplayPlan.cadence}. Cancel
              anytime.
            </Text>
          ) : null}

          {showTrialChip && daysLeft > 0 ? (
            <PressableScale
              onPress={close}
              haptic="light"
              className="mt-3 min-h-[44px] items-center justify-center py-2"
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
            className="mt-3 min-h-[44px] items-center justify-center py-2"
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

          {/* Escape hatch for the non-dismissible state (do not trap anyone —
              NFR-6). Sign-out and account/data deletion live in Settings
              (§8.11); this is the ONLY way to reach them once the header X,
              swipe, and hardware back are all closed off. Hidden whenever the
              screen is dismissible, since the ordinary tab bar already
              reaches Settings from there — no need for a second path. */}
          {!dismissible ? (
            <PressableScale
              onPress={() => router.push('/settings/all')}
              haptic="light"
              className="mt-3 min-h-[44px] items-center justify-center py-2"
              accessibilityRole="button"
              accessibilityLabel="More settings"
              accessibilityHint="Opens settings, including sign out and deleting your data, without requiring a purchase"
            >
              <Text className="text-label font-medium text-neutral-500">
                More settings
              </Text>
            </PressableScale>
          ) : null}
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
              <Ionicons name="construct-outline" size={16} color="#6F6862" />
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
          <Ionicons name="close" size={24} color="#57534E" />
        </PressableScale>
      ) : (
        <View className="h-11 w-11" />
      )}
    </View>
  )
}
