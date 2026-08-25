// ---------------------------------------------------------------------------
// GOOD-FAITH DRAFT — NOT LEGAL ADVICE.
//
// This Terms of Service was written by an AI coding assistant (Claude, via
// Claude Code) based on a read of Ampora's actual codebase and product docs,
// as a starting point only. It is NOT legal advice, and Aria (or whoever
// owns this launch) MUST have a qualified lawyer review and sign off on this
// text before the app is published to the App Store, Play Store, or any
// other public listing. Do not treat this comment, or the screen it
// documents, as a substitute for real legal review. See the [PLACEHOLDER]
// markers in the rendered text below for the specific blanks (contact email,
// business entity name, governing-law jurisdiction) that also need to be
// filled in before publishing.
// ---------------------------------------------------------------------------

/**
 * Terms of Service screen (docs/09_Decisions.md: "A privacy policy and
 * terms of service are required for a launch that includes minors").
 *
 * Every factual claim below is grounded in this codebase as of 2026-08-24:
 * - Eligibility 13+, under-18 parent/guardian review: docs/00_Overview.md
 *   ("Age 13+"), PRD A1, PRD NFR-4/NFR-6.
 * - Trial length (14 days): core/subscription.ts's
 *   `TRIAL_DURATION_DAYS = 14`, PRD FR-88 ("2-week trial"),
 *   docs/09_Decisions.md ("A 2-week free trial").
 * - Freemium, resolved 2026-08-24 (this file originally described the app as
 *   paid-only, correctly, because that was the code at the time). FR-88 was
 *   then rewritten and the behaviour shipped: the free tier is tasks, lists,
 *   tags, calendar, the auto-scheduler and an unlocked timer, and it does not
 *   expire. Paid adds the app-lock and the AI calls. Verified in code, not
 *   just in docs: `core/entitlements.ts` `canUseLock`/`canUseAI`, gated at
 *   `store/stakesStore.ts` (all three arming paths) and
 *   `services/ai.ts#invokeEdge`, with `app/_layout.tsx`'s paywall redirect
 *   removed and `isPaywallDismissible` now always true.
 * - Pricing $6.99 monthly, $39.99 annual. This file originally flagged a real
 *   contradiction here: `PLACEHOLDER_OFFERINGS` said $74.99, and FR-88's old
 *   "annual about 10 percent cheaper per month" rule only supports ~$75. That
 *   flag was correct and it is now resolved the other way: the owner chose
 *   $39.99, the "10 percent" rule is retired, and the code and its test were
 *   updated to match. See the 2026-08-24 entry in docs/09_Decisions.md.
 * - Billed by Apple or Google, cancel in the store's own settings: PRD
 *   FR-88/FR-89 ("Apple In-App Purchase," Android via Play Billing per
 *   the same pattern), core/iap/PurchaseStrategy.ts + NativePurchaseStrategy.ts.
 * - Self-imposed, local-only lock, never remote: PRD N-goal / CLAUDE.md
 *   ("App-locking is self-imposed and local only. Never remote
 *   device-lock."), docs/04_Ignition_Sessions_and_Verification.md.
 * - Panic valve, 60-second friction, always available: PRD FR-42, FR-78,
 *   docs/04 §4/§6/§7.
 * - Never-lock categories (phone, messages, maps, accessibility, OS
 *   settings, Ampora itself): PRD FR-40, core/blocking/limits.ts's
 *   `NEVER_LOCK_CATEGORIES` array (literal tokens: phone, messages, maps,
 *   accessibility, os_settings, ampora).
 * - Wellbeing caps (daily/session) mentioned as supporting detail:
 *   core/blocking/limits.ts (`DEFAULT_DAILY_LOCK_CAP_MIN = 180`,
 *   `DEFAULT_SINGLE_SESSION_CAP_MIN = 50`), PRD §9.10.
 * - No medical claims: PRD N3 ("No medical or clinical claims; not an
 *   ADHD treatment"), CLAUDE.md ("no medical claims").
 * - Fail-safe locking (never traps): PRD NFR-7 ("if a shield cannot be
 *   applied or the OS state is uncertain, never trap the user; default to
 *   unlocked and log").
 * - No formal business entity yet: docs/09_Decisions.md ("LLC formation
 *   is a 'revisit when revenue is meaningful' decision, not a pre-launch
 *   requirement") — hence the bracketed placeholder rather than an
 *   invented company name. Governing-law jurisdiction is genuinely unset
 *   anywhere in this repo, hence that placeholder too.
 *
 * Design system / structure: mirrors app/legal/privacy.tsx exactly (same
 * local Section/Paragraph/Bullet/PlaceholderNotice helpers, same header/
 * back-button/readable-measure treatment) — see that file's top-of-file
 * comment for the shared design-system reasoning.
 */

import React from 'react'
import { View, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { Heading } from '@/components/ui/Heading'
import { Text } from '@/components/ui/Text'
import { PressableScale } from '@/components/ui/PressableScale'
import { colors, layout } from '@/utils/design-tokens'

const LAST_UPDATED = 'August 24, 2026'

// ---------------------------------------------------------------------------
// Local presentational helpers (duplicated from app/legal/privacy.tsx —
// kept file-local per this codebase's convention of small ad-hoc
// subcomponents per screen, rather than a new shared file).
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mt-7">
      <Heading size="h4">{title}</Heading>
      {children}
    </View>
  )
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <Text variant="body" className="mt-2 text-neutral-700">
      {children}
    </Text>
  )
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-2 flex-row">
      <Text variant="body" className="text-neutral-400">
        {'•'}
      </Text>
      <Text variant="body" className="ml-2 flex-1 text-neutral-700">
        {children}
      </Text>
    </View>
  )
}

/** A visually distinct callout for a value that must be filled in before publishing. */
function PlaceholderNotice({ children }: { children: React.ReactNode }) {
  return (
    <View className="mt-2 flex-row items-start gap-2 rounded-xl bg-warning-100 p-3">
      <Ionicons
        name="alert-circle-outline"
        size={18}
        color={colors.light.warningStrong}
        style={{ marginTop: 1 }}
      />
      <Text variant="bodyMedium" className="flex-1 text-warning-700">
        {children}
      </Text>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TermsOfServiceScreen() {
  const insets = useSafeAreaInsets()

  return (
    <View className="flex-1 bg-neutral-100" style={{ paddingTop: insets.top }}>
      {/* Header with back, matching app/settings/all.tsx's precedent. */}
      <View className="flex-row items-center px-5 pb-2 pt-2">
        <PressableScale
          onPress={() => router.back()}
          haptic="light"
          className="-ml-2 h-11 w-11 items-center justify-center rounded-full"
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.light.text} />
        </PressableScale>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {/* Readable measure on wide (web) viewports — see privacy.tsx's
            matching comment for why this technique (not a Screen import) is
            used. */}
        <View
          style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}
        >
          <Text variant="overline" className="text-primary-600">
            Legal
          </Text>
          <Heading size="h1" className="mt-1">
            Terms of Service
          </Heading>
          <Text variant="caption" className="mt-1.5 text-neutral-500">
            Last updated {LAST_UPDATED}
          </Text>

          <Paragraph>
            These Terms of Service (&quot;Terms&quot;) are an agreement between you and
            [BUSINESS ENTITY NAME - fill in before publishing] (&quot;Ampora,&quot;
            &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). By creating an account or using
            Ampora, you agree to these Terms. If you don&apos;t agree, please don&apos;t use the
            app.
          </Paragraph>

          <Section title="Eligibility">
            <Paragraph>
              You must be at least 13 years old to use Ampora. If you are under 18, please review
              these Terms together with a parent or guardian before you continue, so they
              understand what you&apos;re agreeing to.
            </Paragraph>
          </Section>

          <Section title="What Ampora is">
            <Paragraph>
              Ampora is a planning and focus tool. It helps you schedule tasks, breaks work down
              into a small first step, and lets you optionally lock your own distracting apps for
              a bounded work session, as a commitment device you choose and control for yourself.
              Ampora is not a substitute for professional care — see &quot;Not medical
              advice&quot; below.
            </Paragraph>
          </Section>

          <Section title="Your account">
            <Paragraph>
              You need an account to use Ampora, created with Sign in with Apple, Sign in with
              Google, or an email magic link. You&apos;re responsible for keeping your sign-in
              method secure. Tell us if you believe your account has been accessed without your
              permission.
            </Paragraph>
          </Section>

          <Section title="Subscription and billing">
            <Paragraph>
              Ampora is free to use, and the free version does not expire. Creating and organising
              tasks, the calendar, automatic scheduling, and a focus timer without app-locking are
              all included at no cost.
            </Paragraph>
            <Paragraph>
              A paid subscription adds two things: locking your apps during a focus session, and
              the AI task breakdown. It costs $6.99 billed monthly or $39.99 billed annually, with
              a 14-day free trial, and it renews automatically at the end of each billing period
              unless you cancel beforehand. If a subscription lapses you keep the free version and
              everything already in your account. Nothing is deleted and you are never locked out.
            </Paragraph>
            <Paragraph>
              Payment is processed and billed by the Apple App Store or Google Play Store,
              depending on where you subscribed — Ampora never sees or stores your payment
              details. You can manage or cancel your subscription at any time in your Apple ID or
              Google Play account settings. Cancelling stops future renewals but does not refund
              the current billing period, except as required by the relevant store&apos;s policies
              or applicable law.
            </Paragraph>
          </Section>

          <Section title="The lock is self-imposed and local only">
            <Paragraph>
              Ampora&apos;s app-locking feature only ever locks apps on the device you&apos;re
              using, and only because you set it up yourself. Ampora never remotely locks your
              device, and we cannot lock or unlock your device on your behalf.
            </Paragraph>
            <Paragraph>
              A panic valve to unlock early is always available, behind a brief 60-second
              countdown so the choice is deliberate rather than accidental. Daily and per-session
              time limits on locking are built in and cannot be raised past their built-in
              ceiling.
            </Paragraph>
            <Paragraph>
              The following can never be locked, no matter what you select: your phone/dialer,
              messaging apps, maps, accessibility features, your device&apos;s system settings,
              and Ampora itself.
            </Paragraph>
          </Section>

          <Section title="Not medical advice">
            <Paragraph>
              Ampora is a productivity tool, not a medical device or treatment. It does not
              diagnose, treat, cure, or manage ADHD or any other medical or mental health
              condition, and nothing in the app is medical, psychological, or professional
              advice. Ampora is not a substitute for care from a qualified professional. If you
              have concerns about your health, please talk to a doctor or licensed provider.
            </Paragraph>
          </Section>

          <Section title="Acceptable use">
            <Paragraph>You agree not to:</Paragraph>
            <Bullet>Use Ampora for any unlawful purpose.</Bullet>
            <Bullet>
              Try to circumvent, disable, or interfere with Ampora&apos;s security, or with the
              intended operation of its lock feature, for anyone other than yourself.
            </Bullet>
            <Bullet>Reverse-engineer the app beyond what applicable law allows.</Bullet>
            <Bullet>
              Use Ampora to store or transmit content that is illegal, abusive, or infringes
              someone else&apos;s rights.
            </Bullet>
          </Section>

          <Section title="Your content">
            <Paragraph>
              You own the tasks, notes, and other content you put into Ampora. You give us the
              limited right to store, sync, and process that content in order to run the app and
              its features, including sending relevant task text to our AI provider to generate a
              breakdown, as described in the Privacy Policy.
            </Paragraph>
          </Section>

          <Section title="Termination">
            <Paragraph>
              You can stop using Ampora and delete your account at any time in Settings. We may
              suspend or terminate an account that violates these Terms, or as needed to protect
              the service or other users. Ending your account does not entitle you to a refund
              except where required by the relevant app store&apos;s policies or applicable law.
            </Paragraph>
          </Section>

          <Section title="Disclaimers">
            <Paragraph>
              Ampora is provided &quot;as is&quot; and &quot;as available.&quot; We don&apos;t
              guarantee the app will be uninterrupted or error-free, or that its scheduling, AI
              breakdown, or lock features will always behave exactly as expected. App-locking
              depends on operating-system permissions and can fail; if a lock cannot be applied or
              its state is uncertain, Ampora is designed to fail open (unlocked) rather than trap
              you.
            </Paragraph>
          </Section>

          <Section title="Limitation of liability">
            <Paragraph>
              To the fullest extent permitted by law, Ampora and its creators are not liable for
              indirect, incidental, special, or consequential damages arising from your use of the
              app, including missed deadlines, lost data, or lock/unlock issues. Our total
              liability for any claim relating to Ampora is limited to the amount you paid us in
              the 12 months before the claim arose.
            </Paragraph>
          </Section>

          <Section title="Governing law">
            <Paragraph>
              These Terms are governed by the laws of the Commonwealth of Pennsylvania, United
              States, without regard to conflict-of-law principles. Any dispute will be resolved in
              the state or federal courts located in Montgomery County, Pennsylvania, unless
              applicable law requires otherwise.
            </Paragraph>
          </Section>

          <Section title="Changes to these terms">
            <Paragraph>
              We may update these Terms as Ampora changes. If we make a material change, we will
              update the date at the top of this page and, where required, notify you in the app.
              Continuing to use Ampora after a change means you accept the updated Terms.
            </Paragraph>
          </Section>

          <Section title="Contact us">
            <Paragraph>Questions about these Terms can be sent to:</Paragraph>
            <PlaceholderNotice>
              [CONTACT EMAIL - fill in before publishing]
            </PlaceholderNotice>
            <PlaceholderNotice>
              [BUSINESS ENTITY NAME - fill in before publishing]
            </PlaceholderNotice>
          </Section>

          <View className="h-8" />
        </View>
      </ScrollView>
    </View>
  )
}
