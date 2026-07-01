/**
 * CalendarSyncSettings — connect external (read-only) calendars (PRD FR-1,
 * §8.6, roadmap external-calendar sync). Ampora Phase 6.
 *
 * A premium settings group that lets the user connect Google, Outlook, or
 * iCloud calendars so their existing events show up as immovable BUSY blocks
 * the scheduler plans around (never auto-moved — CalEvent, FR-1). Read-only:
 * Ampora reads these calendars, it never writes to them.
 *
 * OAuth for each provider needs per-app setup (client IDs, consent screens,
 * entitlements) that isn't wired yet, so each "Connect" row degrades
 * gracefully to a calm "coming soon / connect on device" explainer instead of
 * crashing or dead-ending. When the real connectors land, swap the
 * `onConnect` handler for the provider's auth flow — the row UI stays.
 *
 * Designed to embed under a section header on the Profile screen (it renders
 * its own grouped white card + shadow, like StakesSettings). Calm, accessible,
 * RN + NativeWind, web-export safe.
 */

import React, { useState } from 'react'
import { View, Text, Modal, Pressable, Platform } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { Heading } from '@/components/ui/Heading'
import { Button } from '@/components/ui/Button'
import { PressableScale } from '@/components/ui/PressableScale'
import { shadows } from '@/utils/design-tokens'

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

interface CalendarProvider {
  key: 'google' | 'outlook' | 'apple'
  label: string
  icon: keyof typeof Ionicons.glyphMap
  /** Tint for the leading icon bubble. */
  tint: string
  tintBg: string
}

const PROVIDERS: CalendarProvider[] = [
  {
    key: 'google',
    label: 'Google Calendar',
    icon: 'logo-google',
    tint: '#2563EB',
    tintBg: 'bg-primary-50',
  },
  {
    key: 'outlook',
    label: 'Outlook',
    icon: 'mail-outline',
    tint: '#2563EB',
    tintBg: 'bg-primary-50',
  },
  {
    key: 'apple',
    label: 'iCloud Calendar',
    icon: 'logo-apple',
    tint: '#18181B',
    tintBg: 'bg-neutral-100',
  },
]

// ---------------------------------------------------------------------------
// CalendarSyncSettings
// ---------------------------------------------------------------------------

export function CalendarSyncSettings() {
  // Which provider's explainer is open (null = closed). No calendar is actually
  // connectable yet, so nothing here persists a "connected" flag.
  const [explainProvider, setExplainProvider] = useState<CalendarProvider | null>(null)

  const openExplainer = (provider: CalendarProvider) => {
    Haptics.selectionAsync().catch(() => {})
    setExplainProvider(provider)
  }

  return (
    <View>
      {/* Intro — set expectations before the rows. */}
      <Text className="mb-4 text-body text-neutral-500">
        Connect a calendar and its events show up as busy time Ampora plans around. Read-only —
        Ampora never changes your other calendars.
      </Text>

      <View className="rounded-2xl border border-neutral-200 bg-white px-4" style={shadows.sm}>
        {PROVIDERS.map((provider, i) => (
          <PressableScale
            key={provider.key}
            onPress={() => openExplainer(provider)}
            haptic={false}
            className={`flex-row items-center py-3.5 ${
              i === PROVIDERS.length - 1 ? '' : 'border-b border-neutral-100'
            }`}
            accessibilityRole="button"
            accessibilityLabel={`Connect ${provider.label}`}
            accessibilityHint="Shows how to connect this calendar"
          >
            <View
              className={`h-9 w-9 items-center justify-center rounded-full ${provider.tintBg}`}
            >
              <Ionicons name={provider.icon} size={18} color={provider.tint} />
            </View>
            <View className="ml-3 flex-1">
              <Text className="text-body-lg text-neutral-900">{provider.label}</Text>
              <Text className="mt-0.5 text-caption text-neutral-500">Not connected</Text>
            </View>
            <View className="flex-row items-center">
              <Text className="mr-1.5 text-label font-medium text-primary-600">Connect</Text>
              <Ionicons name="chevron-forward" size={18} color="#C4C4CC" />
            </View>
          </PressableScale>
        ))}
      </View>

      <Text className="ml-1 mt-2 text-caption text-neutral-400">
        Events from connected calendars are shown as busy blocks and are never moved by the
        scheduler.
      </Text>

      {/* Graceful "coming soon" explainer — no crash, no dead-end. */}
      <Modal
        visible={explainProvider != null}
        transparent
        animationType="fade"
        onRequestClose={() => setExplainProvider(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setExplainProvider(null)}
        >
          <Pressable
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            {explainProvider && (
              <>
                <View
                  className={`h-12 w-12 items-center justify-center rounded-full ${explainProvider.tintBg}`}
                >
                  <Ionicons
                    name={explainProvider.icon}
                    size={24}
                    color={explainProvider.tint}
                  />
                </View>
                <Heading size="h3" className="mt-4">
                  {explainProvider.label}
                </Heading>
                <Text className="mt-2 text-body text-neutral-600 leading-6">
                  {explainerCopy(explainProvider.key)}
                </Text>
                <View className="mt-6">
                  <Button
                    title="Got it"
                    variant="primaryBlue"
                    size="lg"
                    onPress={() => setExplainProvider(null)}
                    accessibilityLabel="Close"
                  />
                </View>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

/**
 * Per-provider explainer copy. Honest about the current state (connecting isn't
 * live yet) while telling the user exactly what will happen when it is. Apple's
 * copy nods to on-device permission (EventKit) since that's the eventual path.
 */
function explainerCopy(key: CalendarProvider['key']): string {
  const soon =
    'Connecting calendars is coming soon. When it lands, your events will appear here as busy time your plan works around — nothing on your calendar ever changes.'
  if (key === 'apple' && Platform.OS === 'ios') {
    return (
      'iCloud events sync through your device calendar, so you can grant read access right on this phone. ' +
      soon
    )
  }
  return soon
}
