import { useState } from 'react'
import type {
  ScribeConversationSummary,
  ScribeHistoryController,
  ScribeLegacyImport,
} from '@/features/scribe/types'
import { listLegacyImports } from '@/features/scribe/legacy/notesImportLedger'
import { undoLegacyImport } from '@/features/scribe/legacy/undoLegacyImport'
import { abortTurn } from '@/features/scribe/runtime/runs'
import {
  deleteStoredConversation,
  useScribeConversations,
  type StoredConversation,
} from '@/features/scribe/stores/conversations'
import { trackUndo } from '@/features/scribe/analytics'

export function conversationSummary(
  conversation: StoredConversation
): ScribeConversationSummary {
  let appliedCount = 0
  for (const proposal of Object.values(conversation.proposals))
    for (const card of proposal.cards)
      if (card.status === 'applied' || card.status === 'partial') appliedCount++
  const pending = conversation.pendingProposalId
    ? conversation.proposals[conversation.pendingProposalId]
    : null
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    appliedCount,
    hasPendingProposal: pending?.status === 'pending',
  }
}

/** Past conversations, and Notes Imports that can still be undone. */
export function useScribeHistory(): ScribeHistoryController {
  const conversations = useScribeConversations((state) => state.conversations)
  // The legacy ledger isn't a store; re-read it after an Undo.
  const [legacyImports, setLegacyImports] =
    useState<ScribeLegacyImport[]>(listLegacyImports)

  return {
    conversations: Object.values(conversations)
      .filter((conversation) => conversation.items.length > 0)
      .map(conversationSummary)
      .sort((a, b) => b.updatedAt - a.updatedAt),
    legacyImports,
    deleteConversation: (id) => {
      abortTurn(id)
      deleteStoredConversation(id)
    },
    undoLegacyImport: (id) => {
      const result = undoLegacyImport(id)
      trackUndo({
        source: 'history',
        target: 'legacy_import',
        result: result.status,
      })
      setLegacyImports(listLegacyImports())
      return result
    },
  }
}
