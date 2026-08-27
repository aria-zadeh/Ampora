// ---------------------------------------------------------------------------
// GOOD-FAITH DRAFT — NOT LEGAL ADVICE.
//
// This Privacy Policy was written by an AI coding assistant (Claude, via
// Claude Code) based on a read of Ampora's actual codebase and product docs,
// as a starting point only. It is NOT legal advice, and Aria (or whoever
// owns this launch) MUST have a qualified lawyer review and sign off on this
// text before the app is published to the App Store, Play Store, or any
// other public listing. Do not treat this comment, or the screen it
// documents, as a substitute for real legal review. See the [PLACEHOLDER]
// markers in the rendered text below for the specific blanks (contact email,
// business entity name) that also need to be filled in before publishing.
// ---------------------------------------------------------------------------

/**
 * Privacy Policy screen (docs/09_Decisions.md: "A privacy policy and terms
 * of service are required for a launch that includes minors").
 *
 * Every factual claim below is grounded in this codebase as of 2026-08-24:
 * - Ages 13+, not directed to children under 13: docs/00_Overview.md ("Age
 *   13+"), PRD NFR-4 ("Age floor 13. COPPA-safe."), PRD A1.
 * - Email for sign-in: services/supabase.ts (signInWithMagicLink,
 *   signInWithApple, signInWithGoogle all resolve to one Supabase auth
 *   session keyed on email).
 * - Tasks/subtasks/lists/tags/projects: services/supabase.ts row mappers
 *   (TaskRow, SubtaskRow, ListRow, TagRow, ProjectRow) — this is the exact
 *   set of fields that leaves the device.
 * - Schedule/calendar busy-time: services/calendarSync.ts (read-only; grep
 *   confirms no createEventAsync/updateEventAsync/deleteEventAsync calls
 *   anywhere in that file, only requestCalendarPermissionsAsync) and
 *   app.json's NSCalendarsUsageDescription, which already states "It only
 *   reads — Ampora never adds, changes, or deletes anything on your
 *   calendar."
 * - Focus session history / lock events / opaque iOS app tokens:
 *   services/supabase.ts (StakeSessionRow, LockEventRow), PRD NFR-4 ("iOS
 *   stake apps are opaque tokens, never de-anonymized"), PRD glossary
 *   ("ApplicationToken... bundle IDs are not exposed on iOS").
 * - Proof records (photo/screenshot): services/supabase.ts (ProofRow),
 *   store/proofStore.ts, docs/04_Ignition_Sessions_and_Verification.md §4/§8
 *   ("private Proof Log").
 * - AI breakdown sends title/notes/duration/due/source text, not identity:
 *   supabase/functions/ai-breakdown/index.ts (the exact request shape) and
 *   PRD NFR-4 ("AI calls send only needed content, no identity"). AI
 *   provider is written as Google below — re-verified 2026-08-27 against
 *   supabase/functions/_shared/gemini.ts, PRD §9.3, and this repo's
 *   CLAUDE.md, which all still describe the live implementation as Google
 *   Gemini (gemini-2.5-flash). A prior draft of this file named Anthropic
 *   here on an announced-but-not-yet-live migration; that was reverted since
 *   it did not match the verified-in-code current fact. Re-check this file
 *   against supabase/functions/_shared/ before publishing if a real provider
 *   migration happens.
 * - Proof verification never uploads the image, only a text caption/
 *   filename: supabase/functions/ai-verify-proof/index.ts's own doc
 *   comment ("this text check reasons over the task title plus any
 *   caption/note the client provides (it does not upload image bytes)").
 * - Microphone/on-device speech recognition only during Brain dump:
 *   services/voiceCapture.ts (wraps expo-speech-recognition's
 *   requiresOnDeviceRecognition; zero fetch/http calls in that file) and
 *   app.json's NSMicrophoneUsageDescription / NSSpeechRecognitionUsageDescription.
 * - Local-first + cloud sync via Supabase: services/supabase.ts (every
 *   sync function no-ops with no signed-in user), CLAUDE.md's "Local-first"
 *   data rule.
 * - Export / erase-this-device / delete-account all live in Settings:
 *   core/dataExport.ts, components/settings/DataSettings.tsx,
 *   supabase/functions/delete-account/index.ts (cascading server-side
 *   delete, re-verifies the caller's own JWT).
 * - No sale / no ad SDKs: PRD NFR-4 ("No ad SDKs, no selling/sharing
 *   data").
 * - No third-party analytics: package.json dependencies audited directly
 *   (no Mixpanel/Amplitude/Segment/Sentry/Firebase/PostHog/Datadog/
 *   Crashlytics or any other analytics/crash SDK present), plus
 *   store/eventLogStore.ts's own doc comment ("on-device analytics only...
 *   nothing here reads the log to change app behavior").
 * - No formal business entity yet: docs/09_Decisions.md ("LLC formation is
 *   a 'revisit when revenue is meaningful' decision, not a pre-launch
 *   requirement") — hence the bracketed placeholder below rather than an
 *   invented company name.
 *
 * Design system: uses components/ui/Text (variant prop, the enforced type
 * scale) and components/ui/Heading exclusively, never a hand-written
 * text-* / font-* combo. Colors via Tailwind semantic classes (mirroring
 * utils/design-tokens.ts through tailwind.config.js) or useThemeColors() for
 * icon `color` props, which RN requires as a literal. Back-button header
 * pattern matches app/settings/all.tsx (the closest existing precedent for
 * a pushed stack screen with a back control) since components/ui/Screen.tsx
 * is unused anywhere else in this app; the readable-measure treatment
 * (maxWidth centered at layout.maxContentWidth) reuses Screen.tsx's own
 * technique for exactly the "wide viewport" case it exists to solve.
 */

import React from 'react'
import { View, ScrollView } from 'react-native'
import { router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'

import { Heading } from '@/components/ui/Heading'
import { Text } from '@/components/ui/Text'
import { PressableScale } from '@/components/ui/PressableScale'
import { layout } from '@/utils/design-tokens'
import { useThemeColors } from '@/hooks/useThemeColors'

const LAST_UPDATED = 'August 24, 2026'

// ---------------------------------------------------------------------------
// Local presentational helpers (kept file-local, matching this codebase's
// convention of small ad-hoc subcomponents per screen — see e.g. ActionRow
// in components/settings/DataSettings.tsx — rather than a new shared file).
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
  const theme = useThemeColors()
  return (
    <View className="mt-2 flex-row items-start gap-2 rounded-xl bg-warning-100 p-3">
      <Ionicons
        name="alert-circle-outline"
        size={18}
        color={theme.warningStrong}
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

export default function PrivacyPolicyScreen() {
  const insets = useSafeAreaInsets()
  const theme = useThemeColors()

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
          <Ionicons name="chevron-back" size={24} color={theme.text} />
        </PressableScale>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-16"
        showsVerticalScrollIndicator={false}
      >
        {/* Readable measure on wide (web) viewports — same maxWidth-centered
            technique components/ui/Screen.tsx uses, applied here directly
            since no other stack screen in this app imports Screen itself. */}
        <View
          style={{ width: '100%', maxWidth: layout.maxContentWidth, alignSelf: 'center' }}
        >
          <Text variant="overline" className="text-primary-600">
            Legal
          </Text>
          <Heading size="h1" className="mt-1">
            Privacy Policy
          </Heading>
          <Text variant="caption" className="mt-1.5 text-neutral-500">
            Last updated {LAST_UPDATED}
          </Text>

          <Paragraph>
            This policy is issued by [BUSINESS ENTITY NAME - fill in before publishing]
            (&quot;Ampora,&quot; &quot;we,&quot; &quot;us,&quot; or &quot;our&quot;). It explains what
            information Ampora collects when you use the app, how that information is used, and
            the choices and rights you have over it.
          </Paragraph>

          <Section title="Age requirement">
            <Paragraph>
              Ampora is intended for people age 13 and older. It is not directed to children
              under 13, and we do not knowingly create accounts for anyone under 13. If we learn
              that we have collected information from a child under 13, we will delete that
              account and its data. A parent or guardian who believes their child under 13 has
              created an Ampora account can contact us at the address below to request deletion.
            </Paragraph>
          </Section>

          <Section title="Information we collect">
            <Paragraph>
              Ampora collects only what it needs to plan your schedule, break down your work, and
              run the optional app-locking feature:
            </Paragraph>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Account information.
              </Text>{' '}
              When you sign in with Apple, Google, or an email magic link, we receive your email
              address so we can create your account, secure it, and sign you in again on another
              device.
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Your tasks and content.
              </Text>{' '}
              Tasks and their subtasks, lists and tags, projects and their phases, and any notes
              or assignment text you choose to paste in for AI breakdown.
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Schedule and calendar busy-time.
              </Text>{' '}
              The times Ampora schedules your tasks into, plus read-only busy-time information
              from any calendar you connect (see &quot;Calendar access&quot; below).
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Focus session history and lock events.
              </Text>{' '}
              When a focus session starts and ends, the session length and lock settings you
              chose, and events like using the panic valve. On iOS, the apps you choose to lock
              are represented to Ampora only as opaque tokens assigned by Apple&apos;s Screen
              Time system, not as app names or identities our servers can read.
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Proof records.
              </Text>{' '}
              If you use the &quot;lock until it&apos;s done&quot; option on a short task, you can
              submit a photo or screenshot as proof of completion. That image, and whether it
              passed a lenient plausibility check, is saved to your own private Proof Log inside
              Ampora.
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Usage events.
              </Text>{' '}
              A small on-device log of things like session completions and how long it took you
              to start a task, used only to show your own patterns back to you.
            </Bullet>
            <Bullet>
              <Text variant="bodyMedium" className="text-neutral-900">
                Microphone audio.
              </Text>{' '}
              If you use Brain dump to add tasks by voice, your microphone is active only while
              you are actively recording.
            </Bullet>
          </Section>

          <Section title="How Ampora uses AI">
            <Paragraph>
              When you ask Ampora to break a task into steps, the task&apos;s title, notes,
              duration, and due date, plus any assignment text or source material you choose to
              paste in, are sent to a third-party AI provider, Google, to generate the
              breakdown and first move. This content is used only to generate your response — it
              is not used to train Google&apos;s models.
            </Paragraph>
            <Paragraph>
              For the optional photo/screenshot proof check, only the task title and a short text
              description of your proof (such as a filename or caption) are sent for a
              plausibility check. The photo or screenshot itself is never uploaded for this
              check.
            </Paragraph>
            <Paragraph>
              If AI isn&apos;t available, Ampora falls back to generating a breakdown entirely on
              your device, and nothing is sent anywhere.
            </Paragraph>
          </Section>

          <Section title="Calendar access is read-only">
            <Paragraph>
              If you connect a calendar (Google, Outlook, or iCloud), Ampora reads its busy times
              so it never schedules a study session on top of your classes or existing events.
              Ampora only reads your calendar — it never creates, changes, or deletes anything on
              it.
            </Paragraph>
          </Section>

          <Section title="Microphone and speech recognition">
            <Paragraph>
              Brain dump turns your spoken words into text using your device&apos;s own on-device
              speech recognizer, not a cloud transcription service. Recording only happens while
              you are actively using Brain dump, and your voice audio is not stored or
              transmitted by Ampora.
            </Paragraph>
          </Section>

          <Section title="Local-first storage and cloud sync">
            <Paragraph>
              Ampora is local-first: your data is stored on your device first. Once you are
              signed in, it syncs to your Ampora account in the cloud (hosted on Supabase) so
              your plan follows you to another device and survives a reinstall.
            </Paragraph>
          </Section>

          <Section title="Who we share information with">
            <Paragraph>
              We do not sell personal information, and we share it only with the service
              providers that make Ampora work: Supabase (our database, authentication, and
              backend host), Google (our AI provider, as described above, and also an option for
              signing in or subscribing), and Apple if you choose to sign in or subscribe through
              them. Each only receives what it needs to perform its role.
            </Paragraph>
          </Section>

          <Section title="What we don't do">
            <Bullet>We do not sell your personal data.</Bullet>
            <Bullet>We do not use advertising identifiers or show you ads.</Bullet>
            <Bullet>
              We do not use third-party analytics or crash-reporting SDKs. The usage log
              described above stays inside your own account.
            </Bullet>
          </Section>

          <Section title="How long we keep your data">
            <Paragraph>
              We keep your data for as long as you have an Ampora account. Erasing data on one
              device clears that device&apos;s local copy only — your cloud account is
              unaffected, and signing back in restores it. Deleting your account permanently
              removes your account and everything tied to it, on every device.
            </Paragraph>
          </Section>

          <Section title="Security">
            <Paragraph>
              Your sign-in session is stored using your device&apos;s secure credential storage.
              In our database, access rules restrict every row of your data to your own signed-in
              account.
            </Paragraph>
          </Section>

          <Section title="Your rights and choices">
            <Paragraph>At any time, in Settings, you can:</Paragraph>
            <Bullet>Export a copy of your data as a JSON file.</Bullet>
            <Bullet>Erase your data on one device without affecting your cloud account.</Bullet>
            <Bullet>
              Permanently delete your account and all its data everywhere, after typing DELETE to
              confirm.
            </Bullet>
            <Paragraph>
              Depending on where you live, you may also have the right to access, correct, or
              request a portable copy of your data, and to object to or restrict certain uses of
              it. Because we do not sell personal data, there is no sale to opt out of, and we
              never treat you differently for exercising a privacy right. To exercise a right not
              already covered by the in-app tools above, contact us at the address below.
            </Paragraph>
          </Section>

          <Section title="Changes to this policy">
            <Paragraph>
              We may update this policy as Ampora changes. If we make a material change, we will
              update the date at the top of this page and, where required, notify you in the
              app.
            </Paragraph>
          </Section>

          <Section title="Contact us">
            <Paragraph>
              Questions about this policy, or a request related to your data, can be sent to:
            </Paragraph>
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
