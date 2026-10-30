import * as Crypto from 'expo-crypto'
import { errorTracking } from '@/lib/errorTracking'
import {
  calendarMonthOf,
  publisherCapabilitiesForMonth,
} from '@/lib/roleHistory'
import { noteUserAction, type UserActionKind } from '@/lib/userAction'
import type {
  ScribeApplyResult,
  ScribeContactChoice,
  ScribeUndoResult,
  ScribeUndoSource,
} from '@/features/scribe/types'
import { RefRegistry } from '@/features/scribe/runtime/refs'
import { readScribeStores } from '@/features/scribe/runtime/snapshot'
import { changeDrafting } from '@/features/scribe/runtime/runs'
import {
  asksConsent,
  canAddProposal,
  withCardToggled,
  withConsent,
  withContactChosen,
} from '@/features/scribe/proposals/cards'
import {
  applyProposal,
  outcomeBlock,
  type AppliedEffect,
} from '@/features/scribe/proposals/apply'
import type { StoredProposal } from '@/features/scribe/proposals/model'
import { undoApplied } from '@/features/scribe/proposals/undo'
import {
  getConversation,
  updateConversation,
  useScribeConversations,
  type StoredConversation,
} from '@/features/scribe/stores/conversations'
import {
  getApplyRecord,
  putApplyRecord,
  removeApplyRecord,
  undoable,
} from '@/features/scribe/stores/ledger'
import { trackProposalResolved, trackUndo } from '@/features/scribe/analytics'

/** The conversation holding a Proposal. */
export function conversationOfProposal(
  conversations: Record<string, StoredConversation>,
  proposalId: string
): StoredConversation | null {
  for (const conversation of Object.values(conversations))
    if (conversation.proposals[proposalId]) return conversation
  return null
}

export const findProposal = (
  conversations: Record<string, StoredConversation>,
  proposalId: string
): StoredProposal | null =>
  conversationOfProposal(conversations, proposalId)?.proposals[proposalId] ??
  null

function changeProposal(
  proposalId: string,
  change: (proposal: StoredProposal) => StoredProposal
): void {
  // While its turn runs, the choice goes to the draft; the turn keeps it.
  if (changeDrafting(proposalId, change)) return
  const conversation = conversationOfProposal(
    useScribeConversations.getState().conversations,
    proposalId
  )
  if (!conversation) return
  const current = conversation.proposals[proposalId]
  const next = change(current)
  if (next === current) return
  updateConversation(conversation.id, (latest) => ({
    ...latest,
    proposals: { ...latest.proposals, [proposalId]: next },
  }))
}

export const toggleProposalCard = (proposalId: string, cardId: string) =>
  changeProposal(proposalId, (proposal) => withCardToggled(proposal, cardId))

export const chooseProposalContact = (
  proposalId: string,
  cardId: string,
  choice: ScribeContactChoice
) =>
  changeProposal(proposalId, (proposal) =>
    withContactChosen(proposal, cardId, choice)
  )

export const setProposalConsent = (
  proposalId: string,
  cardId: string,
  agreed: boolean
) =>
  changeProposal(proposalId, (proposal) =>
    withConsent(proposal, cardId, agreed, new Date())
  )

function resolvedProps(proposal: StoredProposal, before: StoredProposal) {
  return {
    cards: proposal.cards.length,
    appliedCards: proposal.cards.filter(
      (card) => card.status === 'applied' || card.status === 'partial'
    ).length,
    deselectedCards: before.cards.filter((card) => !card.selected).length,
    choiceCards: before.cards.filter((card) => card.contact?.type === 'choice')
      .length,
    consentCards: before.cards.filter(asksConsent).length,
    kinds: proposal.effects.map((effect) => effect.draft.kind),
    tainted: proposal.tainted,
  }
}

/** What the User just did, for a celebration that may follow it. */
function userActionOf(
  applied: readonly AppliedEffect[],
  now: Date
): UserActionKind | null {
  const kinds = new Set(applied.map((effect) => effect.kind))
  if (kinds.has('time.create') || kinds.has('time.update')) {
    const { preferences } = readScribeStores()
    const { entryMode } = publisherCapabilitiesForMonth(
      preferences,
      calendarMonthOf(now)
    )
    return entryMode === 'checkbox' ? 'checkbox' : 'time'
  }
  if (kinds.has('visit.create')) return 'visit'
  if (kinds.has('plan.create') || kinds.has('plan.update')) return 'plan'
  return null
}

const NOTHING_ADDED: ScribeApplyResult = {
  status: 'failed',
  appliedCards: 0,
  skippedCards: 0,
}

/**
 * Add: applies the selected cards (the saga in apply.ts), keeps the undo
 * record, binds pending Refs to what they created, and queues the outcome for
 * the next user message.
 */
export function addScribeProposal(
  proposalId: string,
  deps: { now?: Date; newId?: () => string } = {}
): ScribeApplyResult {
  const conversation = conversationOfProposal(
    useScribeConversations.getState().conversations,
    proposalId
  )
  const proposal = conversation?.proposals[proposalId]
  if (!conversation || !proposal || !canAddProposal(proposal))
    return NOTHING_ADDED
  const now = deps.now ?? new Date()
  const run = applyProposal(proposal, {
    now,
    prefs: readScribeStores().preferences,
    newId: deps.newId ?? Crypto.randomUUID,
  })
  if (run.error)
    errorTracking.captureException(run.error, { area: 'scribe_apply' })
  if (run.applied.length)
    putApplyRecord({
      proposalId,
      conversationId: conversation.id,
      appliedAt: now.getTime(),
      effects: run.applied,
    })
  updateConversation(conversation.id, (latest) => {
    const refs = new RefRegistry(structuredClone(latest.refs))
    for (const { ref, id } of run.bindings) refs.bind(ref, id)
    return {
      ...latest,
      updatedAt: now.getTime(),
      refs: refs.table,
      proposals: { ...latest.proposals, [proposalId]: run.proposal },
      pendingProposalId:
        latest.pendingProposalId === proposalId
          ? null
          : latest.pendingProposalId,
      outcomes: [...latest.outcomes, run.outcome],
    }
  })
  const action = userActionOf(run.applied, now)
  if (action) noteUserAction(action, now.getTime())
  trackProposalResolved({
    outcome: run.result.status,
    ...resolvedProps(run.proposal, proposal),
  })
  return run.result
}

/** Dismiss: nothing is written; the next user message says so. */
export function dismissScribeProposal(
  proposalId: string,
  now: Date = new Date()
): void {
  const conversation = conversationOfProposal(
    useScribeConversations.getState().conversations,
    proposalId
  )
  const proposal = conversation?.proposals[proposalId]
  if (!conversation || !proposal || proposal.status !== 'pending') return
  const dismissed: StoredProposal = {
    ...proposal,
    status: 'dismissed',
    cards: proposal.cards.map((card) => ({ ...card, status: 'dismissed' })),
    resolvedAt: now.getTime(),
  }
  updateConversation(conversation.id, (latest) => ({
    ...latest,
    updatedAt: now.getTime(),
    proposals: { ...latest.proposals, [proposalId]: dismissed },
    pendingProposalId:
      latest.pendingProposalId === proposalId ? null : latest.pendingProposalId,
    outcomes: [...latest.outcomes, outcomeBlock(dismissed, 'dismissed')],
  }))
  trackProposalResolved({
    outcome: 'dismissed',
    ...resolvedProps(dismissed, proposal),
  })
}

/**
 * Undo an applied Proposal within `SCRIBE_UNDO_WINDOW_DAYS`: reverse apply
 * order, leaving records changed since or used by something else (`kept`).
 */
export function undoScribeProposalNow(
  proposalId: string,
  source: ScribeUndoSource,
  now: number = Date.now()
): ScribeUndoResult {
  const record = getApplyRecord(proposalId)
  if (!record || !undoable(record, now)) {
    const result: ScribeUndoResult = { status: 'nothing_to_undo', kept: 0 }
    trackUndo({ source, target: 'scribe', result: result.status })
    return result
  }
  const run = undoApplied(record.effects)
  removeApplyRecord(proposalId)
  // A record the User already deleted is as good as undone.
  const removed = new Set([...run.undone, ...run.gone])
  const conversation = getConversation(record.conversationId)
  if (conversation?.proposals[proposalId])
    updateConversation(record.conversationId, (latest) => {
      const proposal = latest.proposals[proposalId]
      if (!proposal) return latest
      const effects = proposal.effects.map((effect) =>
        removed.has(effect.id)
          ? { ...effect, status: 'undone' as const }
          : effect
      )
      const cards = proposal.cards.map((card) =>
        card.effectIds.some((id) => removed.has(id)) &&
        card.effectIds.every(
          (id) =>
            removed.has(id) ||
            effects.find((e) => e.id === id)?.status !== 'applied'
        )
          ? { ...card, status: 'undone' as const }
          : card
      )
      const next: StoredProposal = {
        ...proposal,
        // Everything kept: it stays added, without Undo.
        status: removed.size > 0 ? 'undone' : proposal.status,
        effects,
        cards,
        undoKept: run.result.kept,
      }
      const refs = new RefRegistry(structuredClone(latest.refs))
      for (const ref of run.unbound) refs.unbind(ref)
      return {
        ...latest,
        updatedAt: now,
        refs: refs.table,
        proposals: { ...latest.proposals, [proposalId]: next },
        outcomes:
          removed.size > 0
            ? [...latest.outcomes, outcomeBlock(next, 'undone')]
            : latest.outcomes,
      }
    })
  trackUndo({ source, target: 'scribe', result: run.result.status })
  return run.result
}
