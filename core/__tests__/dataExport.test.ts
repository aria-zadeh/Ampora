import { describe, expect, it, vi } from 'vitest'

// `core/dataExport.ts` also wires `buildExport`/`wipeAllData` to every
// Zustand+MMKV store (that's the "pure-ish" in the file's own header
// comment). Those stores transitively import `react-native`, which Vitest's
// `node` environment cannot parse (Flow syntax) — so importing the module at
// all requires stubbing its store dependencies out first. The stubs only
// need to exist, not behave: nothing under test here calls `buildExport` or
// `wipeAllData`, only the pure confirmation helpers below.
vi.mock('@/store/mmkv', () => ({ mmkv: { clearAll: vi.fn() } }))
vi.mock('@/store/taskStore', () => ({
  useTaskStore: { getState: () => ({ tasks: {} }), setState: vi.fn() },
}))
vi.mock('@/store/listStore', () => ({
  useListStore: { getState: () => ({ lists: {}, tags: {} }), setState: vi.fn() },
}))
vi.mock('@/store/projectStore', () => ({
  useProjectStore: { getState: () => ({ projects: {} }), setState: vi.fn() },
}))
vi.mock('@/store/scheduleStore', () => ({
  useScheduleStore: { getState: () => ({ blocks: {}, clear: vi.fn() }) },
}))
vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: { getState: () => ({ settings: {} }) },
}))
vi.mock('@/store/sessionStore', () => ({
  useSessionStore: { getState: () => ({ active: null, history: [] }) },
}))
vi.mock('@/store/eventLogStore', () => ({
  useEventLogStore: { getState: () => ({ events: [], clearEvents: vi.fn() }) },
}))
vi.mock('@/store/proofStore', () => ({
  useProofStore: { getState: () => ({ proofs: [], clear: vi.fn() }) },
}))

import {
  DELETE_ACCOUNT_CONFIRM_PHRASE,
  exportFileName,
  isDeleteAccountConfirmed,
} from '@/core/dataExport'

describe('dataExport: isDeleteAccountConfirmed', () => {
  it('matches the exact phrase', () => {
    expect(isDeleteAccountConfirmed(DELETE_ACCOUNT_CONFIRM_PHRASE)).toBe(true)
  })

  it('ignores case (no case-sensitivity trap for a 13+ audience)', () => {
    expect(isDeleteAccountConfirmed('delete')).toBe(true)
    expect(isDeleteAccountConfirmed('Delete')).toBe(true)
    expect(isDeleteAccountConfirmed('dElEtE')).toBe(true)
  })

  it('trims surrounding whitespace', () => {
    expect(isDeleteAccountConfirmed(`  ${DELETE_ACCOUNT_CONFIRM_PHRASE}  `)).toBe(true)
    expect(isDeleteAccountConfirmed(`\n${DELETE_ACCOUNT_CONFIRM_PHRASE}\t`)).toBe(true)
  })

  it('rejects empty, partial, and near-miss input', () => {
    expect(isDeleteAccountConfirmed('')).toBe(false)
    expect(isDeleteAccountConfirmed('DELET')).toBe(false)
    expect(isDeleteAccountConfirmed('DELETE ME')).toBe(false)
    expect(isDeleteAccountConfirmed(' DELETE ACCOUNT ')).toBe(false)
  })

  it('does not match with internal whitespace inserted', () => {
    expect(isDeleteAccountConfirmed('DE LETE')).toBe(false)
  })
})

describe('dataExport: exportFileName', () => {
  it('formats a stable, dated filename', () => {
    const jan5 = new Date(2026, 0, 5, 10, 30).getTime()
    expect(exportFileName(jan5)).toBe('ampora-export-2026-01-05.json')
  })

  it('zero-pads single-digit months and days', () => {
    const mar9 = new Date(2026, 2, 9, 0, 0).getTime()
    expect(exportFileName(mar9)).toBe('ampora-export-2026-03-09.json')
  })
})
