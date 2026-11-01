import type {
  ScribeProposal,
  ScribeProposalController,
} from '@/features/scribe/types'
import { readScribeStores } from '@/features/scribe/runtime/snapshot'
import {
  canAddProposal,
  proposalCounts,
  toScribeProposal,
} from '@/features/scribe/proposals/cards'
import {
  addScribeProposal,
  chooseProposalContact,
  dismissScribeProposal,
  findProposal,
  setProposalConsent,
  toggleProposalCard,
} from '@/features/scribe/proposals/actions'
import { draftingProposal, useScribeRuns } from '@/features/scribe/runtime/runs'
import { useScribeConversations } from '@/features/scribe/stores/conversations'
import { undoable, useScribeLedger } from '@/features/scribe/stores/ledger'

const NO_COUNTS = { selected: 0, ready: 0, needsChoice: 0, needsConsent: 0 }

export function useScribeProposal(
  proposalId: string
): ScribeProposalController {
  const drafting = useScribeRuns((state) =>
    draftingProposal(state.drafting, proposalId)
  )
  const saved = useScribeConversations((state) =>
    findProposal(state.conversations, proposalId)
  )
  const stored = drafting ?? saved

  const record = useScribeLedger((state) => state.records[proposalId])
  const proposal: ScribeProposal | null = stored
    ? toScribeProposal(stored, readScribeStores(), record?.effects)
    : null

  return {
    proposal,
    counts: stored ? proposalCounts(stored) : NO_COUNTS,
    canAdd: stored && !drafting ? canAddProposal(stored) : false,
    canUndo: !!record && undoable(record, Date.now()),
    toggleCard: (cardId) => toggleProposalCard(proposalId, cardId),
    chooseContact: (cardId, choice) =>
      chooseProposalContact(proposalId, cardId, choice),
    setConsent: (cardId, agreed) =>
      setProposalConsent(proposalId, cardId, agreed),
    add: async () => addScribeProposal(proposalId),
    dismiss: () => dismissScribeProposal(proposalId),
  }
}
