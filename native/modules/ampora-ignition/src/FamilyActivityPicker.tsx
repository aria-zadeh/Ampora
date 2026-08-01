/**
 * FamilyActivityPicker.tsx — JS-side wrapper around the native, imperative
 * `presentActivityPicker()` call (docs/05 §2, §3.2).
 *
 * Apple's `FamilyActivityPicker` is a SwiftUI view that only makes sense
 * presented as a modal sheet, so the native side owns presentation end to end
 * (grabs the key window, hosts the SwiftUI picker, resolves once it is
 * dismissed) rather than being exposed as a JS-rendered native view manager
 * that some screen would have to keep mounted. That keeps the integration
 * surface to exactly one call — `getAmporaIgnitionNativeModule()
 * ?.presentActivityPicker()` — matching ARCH_PLAN B6's "app code reaches it
 * only through `strategy.pickStakeApps()`" (`core/blocking/
 * NativeBlockingStrategy.ts` calls straight into that native function).
 *
 * What THIS component adds on top of the bare call is exactly the thing
 * docs/05 §2 asks for and a native view manager would not give you for free:
 * "the picker can crash on very large app categories, provide a fallback UI
 * with a retry." A genuine native crash cannot be caught from JS regardless of
 * how the picker is invoked, so "fallback with retry" here means: never
 * auto-retry, never leave the caller in a spinner forever, and give the user
 * an explicit affordance to try again (or bail) after a failure — the actual
 * mitigation a JS layer can honestly provide.
 *
 * This component is a convenience for whoever wires the real native picker
 * into `components/stakes/AppPicker.tsx` (out of scope for this task — that
 * file currently ships a soft/mock catalog and never calls
 * `pickStakeApps()`). It renders NOTHING while idle or while the native sheet
 * is up (the sheet IS the UI); it only renders the retry fallback on failure.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'

import { getAmporaIgnitionNativeModule } from './index'
import type { NativeStakeSelectionResult } from './types'

export type FamilyActivityPickerResult = NativeStakeSelectionResult

export interface FamilyActivityPickerProps {
  /** Present the picker as soon as this mounts. Default true — it is meant to be mounted on demand, not kept around. */
  autoPresent?: boolean
  /** Seeds the picker with a prior selection so add/remove does not reset everything. */
  previousSelectionId?: string | null
  /** The user saved a selection (possibly empty — Apple allows saving with nothing chosen). */
  onSelect: (result: FamilyActivityPickerResult) => void
  /** The user dismissed the picker without saving. */
  onCancel?: () => void
  /** The native call itself failed (module absent, or the presentation threw). Fired in addition to showing the retry UI. */
  onError?: (error: unknown) => void
}

type Phase = 'idle' | 'presenting' | 'failed'

/**
 * Mount this to immediately present the Screen Time picker. Renders nothing
 * on the happy path (Apple's own sheet is the UI); renders a small "couldn't
 * open the picker" card with a Retry button if the native call rejects.
 */
export function FamilyActivityPicker({
  autoPresent = true,
  previousSelectionId = null,
  onSelect,
  onCancel,
  onError,
}: FamilyActivityPickerProps) {
  const [phase, setPhase] = useState<Phase>('idle')
  // Guards against setting state after the caller has already unmounted us
  // (e.g. the host screen navigated away while the sheet was still up).
  const mountedRef = useRef(true)
  useEffect(
    () => () => {
      mountedRef.current = false
    },
    []
  )

  const present = useCallback(async () => {
    const native = getAmporaIgnitionNativeModule()
    if (!native) {
      // Not linked (wrong platform, flag off, or a build without the module).
      // This is a caller-configuration problem, not a runtime crash, so it
      // goes straight to onError/retry rather than pretending to succeed.
      const err = new Error('ampora-ignition native module is not available')
      onError?.(err)
      if (mountedRef.current) setPhase('failed')
      return
    }

    if (mountedRef.current) setPhase('presenting')
    try {
      const result = await native.presentActivityPicker(previousSelectionId)
      if (!mountedRef.current) return
      if (result.cancelled) {
        setPhase('idle')
        onCancel?.()
        return
      }
      setPhase('idle')
      onSelect(result)
    } catch (err) {
      console.warn('FamilyActivityPicker: presentActivityPicker failed:', err)
      if (!mountedRef.current) return
      setPhase('failed')
      onError?.(err)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previousSelectionId])

  useEffect(() => {
    if (autoPresent) void present()
    // Present exactly once per mount; callers that want a fresh attempt with
    // different props should remount (e.g. change `key`), same convention as
    // the rest of the app's one-shot modal flows.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (phase === 'presenting' || phase === 'idle') {
    // Idle renders nothing (either not started yet, or resolved and the
    // caller is expected to unmount us). Presenting renders a minimal
    // spinner in case there is a visible gap before Apple's sheet animates in.
    return phase === 'presenting' ? (
      <View style={styles.centerFill} accessibilityRole="none">
        <ActivityIndicator />
      </View>
    ) : null
  }

  return (
    <View style={styles.fallback} accessibilityRole="alert">
      <Text style={styles.fallbackTitle}>Couldn&apos;t open the picker</Text>
      <Text style={styles.fallbackBody}>
        This can happen with a very large app category. You can try again, or pick fewer apps at once.
      </Text>
      <Pressable
        onPress={() => void present()}
        style={styles.retryButton}
        accessibilityRole="button"
        accessibilityLabel="Try again"
      >
        <Text style={styles.retryButtonText}>Try again</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  centerFill: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fallback: {
    borderRadius: 12,
    padding: 16,
    gap: 8,
    backgroundColor: '#F7F6F3',
    borderWidth: 1,
    borderColor: '#E7E5E4',
  },
  fallbackTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1917',
  },
  fallbackBody: {
    fontSize: 13,
    color: '#57534E',
  },
  retryButton: {
    marginTop: 4,
    alignSelf: 'flex-start',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2563EB',
    minHeight: 44,
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '600',
  },
})
