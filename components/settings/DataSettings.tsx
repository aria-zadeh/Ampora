/**
 * DataSettings — §8.11 data export, delete-all, and account (Phase 7, PRD FR-65).
 *
 * - Export data: serialize every local store to JSON and hand it off — the
 *   native Share sheet on iOS/Android, a file download on web. Nothing leaves
 *   the device unless the user chooses a destination in the share sheet.
 * - Delete all data: a guarded, two-step confirm that wipes the persisted MMKV
 *   blob and resets the in-memory stores (`core/dataExport.wipeAllData`).
 * - Account: current email + sign out.
 *
 * No native-only export library (expo-sharing/file-system aren't installed and
 * would break web export). Uses RN's built-in `Share` on native and a DOM
 * Blob download on web, so it works everywhere and keeps zero tsc errors.
 * Embeds under its own section header (renders its own cards). RN + NativeWind.
 */

import React, { useEffect, useState } from 'react'
import { View, Text, Platform, Share, Modal, Pressable } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'

import { Heading } from '@/components/ui/Heading'
import { Button } from '@/components/ui/Button'
import { PressableScale } from '@/components/ui/PressableScale'
import { shadows } from '@/utils/design-tokens'
import { SectionLabel, SectionFootnote, Group } from '@/components/settings/SettingsPrimitives'
import { serializeExport, exportFileName, wipeAllData } from '@/core/dataExport'
import { getCurrentUser, signOut } from '@/services/supabase'

// ---------------------------------------------------------------------------
// Export — platform-appropriate hand-off of the serialized JSON.
// ---------------------------------------------------------------------------

/**
 * On web, trigger a file download via a Blob + anchor click. Guarded to the web
 * platform; the DOM globals only exist there, so native never reaches this.
 * Returns true on success.
 */
function downloadOnWeb(json: string, filename: string): boolean {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return false
  try {
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return true
  } catch {
    return false
  }
}

/** A tappable action row with a leading icon bubble + chevron/trailing slot. */
function ActionRow({
  icon,
  iconTint = '#52525B',
  iconBg = 'bg-neutral-100',
  label,
  sublabel,
  onPress,
  busy = false,
  danger = false,
  isLast = false,
  accessibilityHint,
}: {
  icon: keyof typeof Ionicons.glyphMap
  iconTint?: string
  iconBg?: string
  label: string
  sublabel?: string
  onPress: () => void
  busy?: boolean
  danger?: boolean
  isLast?: boolean
  accessibilityHint?: string
}) {
  return (
    <PressableScale
      onPress={onPress}
      haptic="light"
      disabled={busy}
      className={`flex-row items-center py-3.5 ${
        isLast ? '' : 'border-b border-neutral-100'
      }`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
    >
      <View className={`h-9 w-9 items-center justify-center rounded-full ${iconBg}`}>
        <Ionicons name={icon} size={18} color={iconTint} />
      </View>
      <View className="ml-3 flex-1 pr-3">
        <Text
          className={`text-body-lg ${danger ? 'font-medium text-danger-600' : 'text-neutral-900'}`}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text className="mt-0.5 text-caption text-neutral-500">{sublabel}</Text>
        ) : null}
      </View>
      <Ionicons
        name={busy ? 'hourglass-outline' : 'chevron-forward'}
        size={18}
        color={danger ? '#DC2626' : '#C4C4CC'}
      />
    </PressableScale>
  )
}

// ---------------------------------------------------------------------------
// DataSettings
// ---------------------------------------------------------------------------

export function DataSettings() {
  const [exporting, setExporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleted, setDeleted] = useState(false)
  const [userEmail, setUserEmail] = useState<string | null>(null)

  useEffect(() => {
    getCurrentUser()
      .then((u) => setUserEmail(u?.email ?? null))
      .catch(() => {})
  }, [])

  const handleExport = async () => {
    setExporting(true)
    try {
      const json = serializeExport()
      const filename = exportFileName()
      if (Platform.OS === 'web') {
        downloadOnWeb(json, filename)
      } else {
        // Native share sheet. The JSON goes in `message` so the user can save it
        // to Files, send it to themselves, etc. Never throws to the UI.
        await Share.share({ title: filename, message: json })
      }
    } catch {
      // Swallow — export is best-effort; the user can retry.
    } finally {
      setExporting(false)
    }
  }

  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    wipeAllData()
    setConfirmDelete(false)
    setDeleted(true)
  }

  return (
    <View>
      <Text className="mb-4 text-body text-neutral-500">
        Your data lives on your device. Take a copy any time, or clear it out
        completely.
      </Text>

      {/* Export ------------------------------------------------------------- */}
      <SectionLabel>Your data</SectionLabel>
      <Group>
        <ActionRow
          icon="download-outline"
          iconTint="#2563EB"
          iconBg="bg-primary-50"
          label="Export data"
          sublabel="Save a JSON copy of everything"
          onPress={handleExport}
          busy={exporting}
          isLast
          accessibilityHint="Creates a JSON file of all your tasks, projects, and settings"
        />
      </Group>
      <SectionFootnote>
        {Platform.OS === 'web'
          ? 'Downloads a .json file with your tasks, projects, schedule, and settings.'
          : 'Opens the share sheet so you can save or send a copy of your tasks, projects, and settings.'}
      </SectionFootnote>

      {/* Account ------------------------------------------------------------ */}
      <View className="mt-6">
        <SectionLabel>Account</SectionLabel>
      </View>
      <Group>
        {userEmail ? (
          <View className="flex-row items-center border-b border-neutral-100 py-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
              <Ionicons name="mail-outline" size={18} color="#52525B" />
            </View>
            <Text className="ml-3 flex-1 text-body-lg text-neutral-900" numberOfLines={1}>
              {userEmail}
            </Text>
          </View>
        ) : null}
        <ActionRow
          icon="log-out-outline"
          iconTint="#DC2626"
          iconBg="bg-danger-100"
          label="Sign out"
          onPress={() => signOut()}
          danger
          isLast
          accessibilityHint="Signs you out of your account"
        />
      </Group>

      {/* Danger zone -------------------------------------------------------- */}
      <View className="mt-6">
        <SectionLabel>Danger zone</SectionLabel>
      </View>
      <Group>
        {deleted ? (
          <View className="flex-row items-center py-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-success-100">
              <Ionicons name="checkmark-circle-outline" size={18} color="#16A34A" />
            </View>
            <Text className="ml-3 flex-1 text-body-lg text-neutral-900">
              All local data cleared
            </Text>
          </View>
        ) : (
          <ActionRow
            icon="trash-outline"
            iconTint="#DC2626"
            iconBg="bg-danger-100"
            label="Delete all data"
            sublabel="Erase every task, project, and record"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              setConfirmDelete(true)
            }}
            danger
            isLast
            accessibilityHint="Permanently erases all local data on this device"
          />
        )}
      </Group>
      <SectionFootnote>
        This clears everything stored on this device and can't be undone. Export
        a copy first if you might want it.
      </SectionFootnote>

      {/* Delete confirmation ------------------------------------------------ */}
      <Modal
        visible={confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(false)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setConfirmDelete(false)}
        >
          <Pressable
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            <View className="h-12 w-12 items-center justify-center rounded-full bg-danger-100">
              <Ionicons name="trash-outline" size={24} color="#DC2626" />
            </View>
            <Heading size="h3" className="mt-4">
              Delete all data?
            </Heading>
            <Text className="mt-2 text-body text-neutral-600 leading-6">
              This erases every task, project, schedule, and record stored on this
              device. It can't be undone.
            </Text>
            <View className="mt-6 gap-2.5">
              <Button
                title="Delete everything"
                variant="destructive"
                size="lg"
                onPress={handleDelete}
                accessibilityLabel="Confirm delete all data"
              />
              <Button
                title="Keep my data"
                variant="secondary"
                size="lg"
                onPress={() => setConfirmDelete(false)}
                accessibilityLabel="Cancel and keep my data"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
