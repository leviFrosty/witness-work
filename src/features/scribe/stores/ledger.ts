import { create } from 'zustand'
import { createJSONStorage } from 'zustand/middleware'
import { keepPersistedState, persist } from '@/stores/persist'
import { MmkvStorage } from '@/stores/mmkv'
import type { AppliedEffect } from '@/features/scribe/proposals/apply'
import { SCRIBE_UNDO_WINDOW_DAYS } from '@/features/scribe/constants'
const UNDO_WINDOW_MS = SCRIBE_UNDO_WINDOW_DAYS * 24 * 60 * 60 * 1000

export interface ApplyRecord {
  proposalId: string
  conversationId: string
  appliedAt: number

  effects: AppliedEffect[]
}

interface ScribeLedgerState {
  records: Record<string, ApplyRecord>
}

export const undoable = (record: ApplyRecord, now: number): boolean =>
  now - record.appliedAt < UNDO_WINDOW_MS

const withinWindow = (
  records: Record<string, ApplyRecord>,
  now: number
): Record<string, ApplyRecord> =>
  Object.fromEntries(
    Object.entries(records).filter(([, record]) => undoable(record, now))
  )

export const useScribeLedger = create<ScribeLedgerState>()(
  persist<ScribeLedgerState>(() => ({ records: {} }), {
    name: 'scribe-ledger',
    version: 1,
    migrate: keepPersistedState,
    storage: createJSONStorage(() => MmkvStorage),
    merge: (persisted, current) => ({
      ...current,
      records: withinWindow(
        ((persisted ?? {}) as Partial<ScribeLedgerState>).records ?? {},
        Date.now()
      ),
    }),
  })
)

export const getApplyRecord = (proposalId: string): ApplyRecord | null =>
  useScribeLedger.getState().records[proposalId] ?? null

export function putApplyRecord(record: ApplyRecord): void {
  useScribeLedger.setState(({ records }) => ({
    records: { ...records, [record.proposalId]: record },
  }))
}

export function removeApplyRecord(proposalId: string): void {
  useScribeLedger.setState(({ records }) => {
    const { [proposalId]: _removed, ...rest } = records
    return { records: rest }
  })
}

export function pruneLedger(now: number = Date.now()): void {
  useScribeLedger.setState(({ records }) => ({
    records: withinWindow(records, now),
  }))
}
