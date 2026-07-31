/**
 * DataSettings — §8.11 data export, erase-local-data, account deletion, and
 * About/Help/Legal (Phase 7, PRD FR-65; account deletion is FR-87).
 *
 * - Export data: serialize every local store to JSON and hand it off — the
 *   native Share sheet on iOS/Android, a file download on web. Nothing leaves
 *   the device unless the user chooses a destination in the share sheet.
 * - Erase data on this device: a guarded, two-step confirm that wipes the
 *   persisted MMKV blob and resets the in-memory stores
 *   (`core/dataExport.wipeAllData`). DEVICE-ONLY and reversible — the cloud
 *   copy survives, so signing back in restores everything. Deliberately
 *   relabeled (was "Delete all data") so it reads as unmistakably distinct
 *   from account deletion below, per FR-87's "two destructive actions, never
 *   one button."
 * - Delete account: PERMANENT, cross-device, unrecoverable
 *   (`services/supabase.ts#deleteAccount`, which calls the `delete-account`
 *   edge function then wipes local data and signs out itself — this screen
 *   must not repeat either of those). Apple guideline 5.1.1(v) requires
 *   in-app account deletion for any app offering account creation; GDPR/CCPA
 *   erasure rights apply regardless. Gated behind a multi-step flow: an
 *   explanation with data export offered first, then a typed "DELETE"
 *   confirmation (`core/dataExport.isDeleteAccountConfirmed` — a single "are
 *   you sure" is not proportionate to an irreversible, every-device action),
 *   then the attempt itself. A failed attempt says plainly that nothing was
 *   deleted and nothing was lost, and offers a direct retry.
 * - Account: current email + sign out.
 * - About / Help / Legal: quiet affordances (Phase 4 polish audit). No
 *   invented external links — Ampora has no live support site or published
 *   legal docs yet, so each opens a small honest in-app sheet instead of a
 *   dead URL. Version reads the real `app.json`/`package.json` version.
 *
 * No native-only export library (expo-sharing/file-system aren't installed and
 * would break web export). Uses RN's built-in `Share` on native and a DOM
 * Blob download on web, so it works everywhere and keeps zero tsc errors.
 * Embeds under its own section header (renders its own cards). RN + NativeWind.
 */

import React, { useEffect, useState } from 'react'
import {
  View,
  Text,
  Platform,
  Share,
  Modal,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import Constants from 'expo-constants'

import { Heading } from '@/components/ui/Heading'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { PressableScale } from '@/components/ui/PressableScale'
import { colors, shadows } from '@/utils/design-tokens'
import { SectionLabel, SectionFootnote, Group } from '@/components/settings/SettingsPrimitives'
import {
  serializeExport,
  exportFileName,
  wipeAllData,
  isDeleteAccountConfirmed,
  DELETE_ACCOUNT_CONFIRM_PHRASE,
} from '@/core/dataExport'
import { getCurrentUser, signOut, deleteAccount } from '@/services/supabase'

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0'

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
  iconTint = colors.light.textSecondary,
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
        color={danger ? colors.light.dangerStrong : colors.light.textDisabled}
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

  // Erase data on THIS DEVICE only — device-only, reversible (the cloud copy
  // survives; signing back in restores everything). Distinct from account
  // deletion below, which is permanent and cross-device.
  const handleEraseLocal = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    wipeAllData()
    setConfirmDelete(false)
    setDeleted(true)
  }

  const [infoSheet, setInfoSheet] = useState<'help' | 'legal' | null>(null)
  const openInfo = (sheet: 'help' | 'legal') => {
    Haptics.selectionAsync().catch(() => {})
    setInfoSheet(sheet)
  }

  // -------------------------------------------------------------------------
  // Delete account (FR-87) — PERMANENT, every device, unrecoverable. A
  // distinct flow from the local erase above: explanation + export offered
  // first -> typed "DELETE" confirmation -> the attempt -> honest success/
  // failure. `deleteAccount()` (services/supabase.ts) already wipes local
  // data and signs out on success, so this handler must not repeat either.
  // -------------------------------------------------------------------------
  const [deleteAccountStep, setDeleteAccountStep] = useState<
    'closed' | 'intro' | 'confirm' | 'deleting' | 'error'
  >('closed')
  const [deleteAccountText, setDeleteAccountText] = useState('')
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)

  const openDeleteAccount = () => {
    Haptics.selectionAsync().catch(() => {})
    setDeleteAccountText('')
    setDeleteAccountError(null)
    setDeleteAccountStep('intro')
  }

  const closeDeleteAccount = () => {
    // Never let a dismiss (overlay tap, hardware back) interrupt an in-flight
    // deletion — the request is already on the wire.
    if (deleteAccountStep === 'deleting') return
    setDeleteAccountStep('closed')
    setDeleteAccountText('')
    setDeleteAccountError(null)
  }

  const attemptAccountDeletion = async () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {})
    setDeleteAccountStep('deleting')
    const { error } = await deleteAccount()
    if (error) {
      setDeleteAccountError('Nothing was deleted and nothing was lost. Check your connection and try again.')
      setDeleteAccountStep('error')
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {})
      return
    }
    // Success: deleteAccount() already wiped local data and signed out, which
    // flips the auth gate in app/_layout.tsx to redirect to /auth on its own.
    // Just close and reset here in case that redirect hasn't landed yet.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {})
    setDeleteAccountStep('closed')
    setDeleteAccountText('')
    setDeleteAccountError(null)
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
          iconTint={colors.light.primary}
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
              <Ionicons name="mail-outline" size={18} color={colors.light.textSecondary} />
            </View>
            <Text className="ml-3 flex-1 text-body-lg text-neutral-900" numberOfLines={1}>
              {userEmail}
            </Text>
          </View>
        ) : null}
        <ActionRow
          icon="log-out-outline"
          iconTint={colors.light.dangerStrong}
          iconBg="bg-danger-100"
          label="Sign out"
          onPress={() => signOut()}
          danger
          isLast
          accessibilityHint="Signs you out of your account"
        />
      </Group>

      {/* About ---------------------------------------------------------------
          Quiet affordances (Phase 4 polish audit). No invented external
          links — each opens a small honest in-app sheet. */}
      <View className="mt-6">
        <SectionLabel>About</SectionLabel>
      </View>
      <Group>
        <ActionRow
          icon="help-circle-outline"
          iconTint={colors.light.primary}
          iconBg="bg-primary-50"
          label="Help"
          sublabel="What Ampora does and how it's built to help"
          onPress={() => openInfo('help')}
          accessibilityHint="Opens a short explanation of how Ampora works"
        />
        <ActionRow
          icon="document-text-outline"
          label="Legal"
          sublabel="Privacy and terms"
          onPress={() => openInfo('legal')}
          accessibilityHint="Opens the current privacy and terms notice"
        />
        <View className="flex-row items-center py-3.5">
          <View className="h-9 w-9 items-center justify-center rounded-full bg-neutral-100">
            <Ionicons name="information-circle-outline" size={18} color={colors.light.textSecondary} />
          </View>
          <Text className="ml-3 flex-1 text-body-lg text-neutral-900">Version</Text>
          <Text className="text-body text-neutral-500">{APP_VERSION}</Text>
        </View>
      </Group>

      {/* Danger zone --------------------------------------------------------
          Two distinct destructive actions, deliberately never one button:
          erasing this device is local-only and reversible (sign back in to
          restore from the cloud); deleting the account is permanent and
          removes it from every device. Separate cards, separate footnotes,
          separate confirmation flows, so the difference reads as
          unmistakable rather than one vague "delete" affordance. */}
      <View className="mt-6">
        <SectionLabel>Danger zone</SectionLabel>
      </View>

      <Group>
        {deleted ? (
          <View className="flex-row items-center py-3.5">
            <View className="h-9 w-9 items-center justify-center rounded-full bg-success-100">
              <Ionicons name="checkmark-circle-outline" size={18} color={colors.light.successAccent} />
            </View>
            <Text className="ml-3 flex-1 text-body-lg text-neutral-900">
              Local data erased
            </Text>
          </View>
        ) : (
          <ActionRow
            icon="trash-outline"
            iconTint={colors.light.dangerStrong}
            iconBg="bg-danger-100"
            label="Erase data on this device"
            sublabel="Clears tasks, projects, and history stored here"
            onPress={() => {
              Haptics.selectionAsync().catch(() => {})
              setConfirmDelete(true)
            }}
            danger
            isLast
            accessibilityHint="Clears local data on this device only. Your account and cloud copy are not affected."
          />
        )}
      </Group>
      <SectionFootnote>
        Device-only. Your Ampora account and cloud copy are untouched — sign
        back in to get everything back.
      </SectionFootnote>

      <View className="mt-4">
        <Group>
          <ActionRow
            icon="person-remove-outline"
            iconTint={colors.light.dangerStrong}
            iconBg="bg-danger-100"
            label="Delete account"
            sublabel="Permanently deletes your account and all its data"
            onPress={openDeleteAccount}
            danger
            isLast
            accessibilityHint="Opens the account deletion flow. This permanently deletes your account and all its data on every device."
          />
        </Group>
        <SectionFootnote>
          Permanent, and removes your account from every device. This can't
          be undone.
        </SectionFootnote>
      </View>

      {/* Erase-local-data confirmation — single confirm is proportionate here:
          device-only and reversible by signing back in. */}
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
              <Ionicons name="trash-outline" size={24} color={colors.light.dangerStrong} />
            </View>
            <Heading size="h3" className="mt-4">
              Erase data on this device?
            </Heading>
            <Text className="mt-2 text-body text-neutral-600 leading-6">
              This clears every task, project, schedule, and record stored on
              this device. Your Ampora account and cloud copy are not
              affected — sign back in here or on any device to get it all
              back.
            </Text>
            <View className="mt-6 gap-2.5">
              <Button
                title="Erase this device"
                variant="destructive"
                size="lg"
                onPress={handleEraseLocal}
                accessibilityLabel="Confirm erase data on this device"
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

      {/* Delete-account flow — PERMANENT, every device, unrecoverable, so it
          gets a proportionately stronger gate than the erase-local modal
          above: an explanation with data export offered first, then a typed
          "DELETE" confirmation (not just a tap), then the attempt itself.
          `deleteAccountStep` drives which of the four panels below renders;
          only one Modal so there is only ever one dialog on screen. */}
      <Modal
        visible={deleteAccountStep !== 'closed'}
        transparent
        animationType="fade"
        onRequestClose={closeDeleteAccount}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className="flex-1"
        >
          <Pressable
            className="flex-1 items-center justify-center bg-black/40 px-8"
            onPress={closeDeleteAccount}
          >
            <Pressable
              className="w-full max-w-[360px] rounded-2xl bg-white p-6"
              style={shadows.lg}
              onPress={(e) => e.stopPropagation()}
            >
              {deleteAccountStep === 'intro' ? (
                <>
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-danger-100">
                    <Ionicons name="person-remove-outline" size={24} color={colors.light.dangerStrong} />
                  </View>
                  <Heading size="h3" className="mt-4">
                    Delete your account
                  </Heading>
                  <Text className="mt-2 text-body text-neutral-600 leading-6">
                    This permanently deletes your Ampora account and every
                    task, project, and record tied to it, on every device you
                    use. It cannot be undone.
                  </Text>
                  <PressableScale
                    onPress={handleExport}
                    haptic="light"
                    disabled={exporting}
                    className="mt-4 flex-row items-center rounded-lg border border-neutral-200 bg-neutral-50 p-3"
                    accessibilityRole="button"
                    accessibilityLabel="Export your data"
                    accessibilityHint="Saves a copy of your tasks, projects, and settings before you delete your account"
                  >
                    <View className="h-9 w-9 items-center justify-center rounded-full bg-primary-50">
                      <Ionicons
                        name={exporting ? 'hourglass-outline' : 'download-outline'}
                        size={18}
                        color={colors.light.primary}
                      />
                    </View>
                    <View className="ml-3 flex-1">
                      <Text className="text-label font-medium text-neutral-900">
                        Export your data first
                      </Text>
                      <Text className="mt-0.5 text-caption text-neutral-500">
                        Save a copy before you go
                      </Text>
                    </View>
                  </PressableScale>
                  <View className="mt-6 gap-2.5">
                    <Button
                      title="Continue"
                      variant="secondary"
                      size="lg"
                      onPress={() => setDeleteAccountStep('confirm')}
                      accessibilityLabel="Continue to delete your account"
                    />
                    <Button
                      title="Cancel"
                      variant="ghost"
                      size="lg"
                      onPress={closeDeleteAccount}
                      accessibilityLabel="Cancel account deletion"
                    />
                  </View>
                </>
              ) : null}

              {deleteAccountStep === 'confirm' ? (
                <>
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-danger-100">
                    <Ionicons name="warning-outline" size={24} color={colors.light.dangerStrong} />
                  </View>
                  <Heading size="h3" className="mt-4">
                    Type DELETE to confirm
                  </Heading>
                  <Text className="mt-2 text-body text-neutral-600 leading-6">
                    This is permanent. Your account and everything in it will
                    be deleted from every device. Type DELETE below to
                    confirm.
                  </Text>
                  <Input
                    containerClassName="mt-4"
                    label={`Type ${DELETE_ACCOUNT_CONFIRM_PHRASE} to confirm`}
                    placeholder={DELETE_ACCOUNT_CONFIRM_PHRASE}
                    value={deleteAccountText}
                    onChangeText={setDeleteAccountText}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    autoComplete="off"
                    error={deleteAccountText.length > 0 && !isDeleteAccountConfirmed(deleteAccountText)}
                    helperText={
                      deleteAccountText.length > 0 && !isDeleteAccountConfirmed(deleteAccountText)
                        ? `Type ${DELETE_ACCOUNT_CONFIRM_PHRASE} exactly to enable the button below`
                        : undefined
                    }
                    accessibilityLabel={`Type ${DELETE_ACCOUNT_CONFIRM_PHRASE} to confirm account deletion`}
                  />
                  <View className="mt-6 gap-2.5">
                    <Button
                      title="Delete my account"
                      variant="destructive"
                      size="lg"
                      onPress={attemptAccountDeletion}
                      disabled={!isDeleteAccountConfirmed(deleteAccountText)}
                      accessibilityLabel="Delete my account permanently"
                      accessibilityHint={`Disabled until you type ${DELETE_ACCOUNT_CONFIRM_PHRASE} above`}
                    />
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="lg"
                      onPress={closeDeleteAccount}
                      accessibilityLabel="Cancel account deletion"
                    />
                  </View>
                </>
              ) : null}

              {deleteAccountStep === 'deleting' ? (
                <View className="items-center py-2">
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-danger-100">
                    <Ionicons name="person-remove-outline" size={24} color={colors.light.dangerStrong} />
                  </View>
                  <View accessibilityLiveRegion="polite" className="items-center">
                    <Heading size="h3" className="mt-4 text-center">
                      Deleting your account
                    </Heading>
                    <Text className="mt-3 text-body text-neutral-500 text-center">
                      This only takes a moment. Don't close the app.
                    </Text>
                  </View>
                  <View className="mt-4">
                    <ActivityIndicator
                      color={colors.light.dangerStrong}
                      accessibilityLabel="Deleting"
                    />
                  </View>
                </View>
              ) : null}

              {deleteAccountStep === 'error' ? (
                <>
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-danger-100">
                    <Ionicons name="alert-circle-outline" size={24} color={colors.light.dangerStrong} />
                  </View>
                  <View accessibilityLiveRegion="polite">
                    <Heading size="h3" className="mt-4">
                      Your account was not deleted
                    </Heading>
                    <Text className="mt-2 text-body text-neutral-600 leading-6">
                      {deleteAccountError}
                    </Text>
                  </View>
                  <View className="mt-6 gap-2.5">
                    <Button
                      title="Try again"
                      variant="destructive"
                      size="lg"
                      onPress={attemptAccountDeletion}
                      accessibilityLabel="Try deleting my account again"
                    />
                    <Button
                      title="Cancel"
                      variant="secondary"
                      size="lg"
                      onPress={closeDeleteAccount}
                      accessibilityLabel="Cancel account deletion"
                    />
                  </View>
                </>
              ) : null}
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>

      {/* Help / Legal info sheet — honest, static content; no external links. */}
      <Modal
        visible={infoSheet != null}
        transparent
        animationType="fade"
        onRequestClose={() => setInfoSheet(null)}
      >
        <Pressable
          className="flex-1 items-center justify-center bg-black/40 px-8"
          onPress={() => setInfoSheet(null)}
        >
          <Pressable
            className="w-full max-w-[360px] rounded-2xl bg-white p-6"
            style={shadows.lg}
            onPress={(e) => e.stopPropagation()}
          >
            {infoSheet === 'help' ? (
              <>
                <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-50">
                  <Ionicons name="help-circle-outline" size={24} color={colors.light.primary} />
                </View>
                <Heading size="h3" className="mt-4">
                  How Ampora helps
                </Heading>
                <Text className="mt-2 text-body text-neutral-600 leading-6">
                  Ampora plans your week around how you actually work, gives you a
                  small first step for every task, and can lock your own apps
                  behind the work if you choose to turn that on. A panic valve is
                  always available if a lock ever feels like too much. Nothing
                  here is medical advice — it's a planning tool.
                </Text>
              </>
            ) : (
              <>
                <View className="h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                  <Ionicons name="document-text-outline" size={24} color={colors.light.textSecondary} />
                </View>
                <Heading size="h3" className="mt-4">
                  Privacy and terms
                </Heading>
                <Text className="mt-2 text-body text-neutral-600 leading-6">
                  Your tasks and settings live on your device first and sync to
                  your account so you can pick up on another device. Full,
                  published privacy and terms documents are being finalized —
                  this notice will link to them once they're live.
                </Text>
              </>
            )}
            <View className="mt-6">
              <Button
                title="Close"
                variant="secondary"
                size="lg"
                onPress={() => setInfoSheet(null)}
                accessibilityLabel="Close"
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}
