import type { ScribeApplyResult } from '@/features/scribe/types'
import type { ProposalOutcomeBlock } from '@/features/scribe/lib/wire'
import type { ScribePreferences } from '@/features/scribe/runtime/snapshot'
import {
  APPLY_ORDER,
  type StoredCard,
  type StoredEffect,
  type StoredProposal,
} from '@/features/scribe/proposals/model'
import { needsChoice } from '@/features/scribe/proposals/cards'
import type {
  ApplyContext,
  ApplyOutcome,
  UndoRecord,
} from '@/features/scribe/proposals/effects/types'
import { applyTimeCreate } from '@/features/scribe/proposals/effects/time'
import {
  applyPlanCreate,
  applyPlanUpdate,
} from '@/features/scribe/proposals/effects/plan'
import {
  applyContactCreate,
  applyContactUpdate,
} from '@/features/scribe/proposals/effects/contact'
import { applyVisitCreate } from '@/features/scribe/proposals/effects/visit'
import { applyCategoryCreate } from '@/features/scribe/proposals/effects/category'
import { undoApplied } from '@/features/scribe/proposals/undo'

/** One applied effect, as the ledger keeps it. */
export interface AppliedEffect {
  effectId: string
  kind: StoredEffect['draft']['kind']
  undo: UndoRecord
}

export interface ApplyRun {
  /** The Proposal with every effect's and card's outcome. */
  proposal: StoredProposal
  result: ScribeApplyResult
  /** Undo records in apply order; empty when nothing was applied. */
  applied: AppliedEffect[]
  /** Pending Refs now bound to the records they created. */
  bindings: { ref: string; id: string }[]
  /** For the next user message. */
  outcome: ProposalOutcomeBlock
  /** The error that rolled the apply back, when it failed. */
  error: unknown
}

function applyOne(effect: StoredEffect, ctx: ApplyContext): ApplyOutcome {
  const { draft } = effect
  switch (draft.kind) {
    case 'category.create':
      return applyCategoryCreate(draft, ctx)
    case 'contact.create':
      return applyContactCreate(draft, ctx)
    case 'contact.update':
      return applyContactUpdate(draft, ctx)
    case 'visit.create':
      return applyVisitCreate(draft, ctx)
    case 'time.create':
      return applyTimeCreate(draft, ctx)
    case 'plan.create':
      return applyPlanCreate(draft, ctx)
    case 'plan.update':
      return applyPlanUpdate(draft, ctx)
  }
}

const cardStatus = (
  card: StoredCard,
  effects: ReadonlyMap<string, StoredEffect>
): StoredCard['status'] => {
  if (!card.selected) return 'dismissed'
  // A contact.create the User answered with an existing Contact isn't counted.
  const counted = card.effectIds
    .map((id) => effects.get(id)!)
    .filter(
      (effect) => !(effect.status === 'skipped' && effect.skipReason === null)
    )
  if (counted.some((effect) => effect.status === 'failed')) return 'failed'
  const applied = counted.filter((effect) => effect.status === 'applied').length
  if (applied === counted.length && applied > 0) return 'applied'
  if (applied > 0) return 'partial'
  return 'skipped'
}

/** `proposal_outcome` for the next user message. */
export function outcomeBlock(
  proposal: StoredProposal,
  outcome: ProposalOutcomeBlock['outcome']
): ProposalOutcomeBlock {
  const applied = new Set<string>()
  const all: string[] = []
  for (const effect of proposal.effects)
    for (const callId of effect.callIds) {
      if (!all.includes(callId)) all.push(callId)
      if (
        effect.status === 'applied' &&
        outcome !== 'undone' &&
        outcome !== 'failed'
      )
        applied.add(callId)
      if (outcome === 'undone' && effect.status === 'undone')
        applied.add(callId)
    }
  // A pending Ref names a record once its call is added: the one it created,
  // or the existing Contact the User picked instead.
  const created: { callId: string; ref: string }[] = []
  if (outcome === 'applied' || outcome === 'partially_applied')
    for (const effect of proposal.effects) {
      const { draft } = effect
      const callId = effect.callIds[0]
      const bound =
        effect.status === 'applied' ||
        (effect.status === 'skipped' && effect.skipReason === null)
      if (
        (draft.kind === 'contact.create' || draft.kind === 'category.create') &&
        bound &&
        applied.has(callId)
      )
        created.push({ callId, ref: draft.ref })
    }
  return {
    type: 'proposal_outcome',
    proposalId: proposal.id,
    outcome,
    applied: all.filter((id) => applied.has(id)),
    notApplied: all.filter((id) => !applied.has(id)),
    ...(created.length ? { created } : {}),
  }
}

/**
 * The apply saga: the selected cards' effects in kind order, pending Refs bound
 * to new ids as they're created, updates re-checked first (`skipped` when the
 * record changed or vanished). A thrown error undoes everything this apply did,
 * in reverse, and marks the Proposal `failed`.
 */
export function applyProposal(
  proposal: StoredProposal,
  deps: { now: Date; prefs: ScribePreferences; newId: () => string }
): ApplyRun {
  const effects = new Map(
    proposal.effects.map((effect) => [effect.id, { ...effect }])
  )
  const ctx: ApplyContext = {
    now: deps.now,
    prefs: deps.prefs,
    bound: new Map(),
    newId: deps.newId,
  }

  const selected = new Set<string>()
  for (const card of proposal.cards) {
    if (!card.selected || needsChoice(card)) continue
    for (const id of card.effectIds) selected.add(id)
    if (
      card.contact?.type === 'choice' &&
      card.contact.chosen?.type === 'existing'
    ) {
      // The User picked who it was: its Visits go to that Contact.
      ctx.bound.set(card.contact.newRef, card.contact.chosen.contactId)
      for (const id of card.effectIds) {
        const effect = effects.get(id)!
        if (effect.draft.kind === 'contact.create') {
          effect.status = 'skipped'
          effect.skipReason = null
          selected.delete(id)
        }
      }
    }
  }

  const ordered = [...effects.values()]
    .filter((effect) => selected.has(effect.id))
    .sort(
      (a, b) =>
        APPLY_ORDER.indexOf(a.draft.kind) - APPLY_ORDER.indexOf(b.draft.kind)
    )

  const applied: AppliedEffect[] = []
  let error: unknown = null
  try {
    for (const effect of ordered) {
      const outcome = applyOne(effect, ctx)
      if (outcome.status === 'applied') {
        effect.status = 'applied'
        effect.skipReason = null
        applied.push({
          effectId: effect.id,
          kind: effect.draft.kind,
          undo: outcome.undo,
        })
      } else {
        effect.status = 'skipped'
        effect.skipReason = outcome.reason
      }
    }
  } catch (thrown) {
    error = thrown
    undoApplied(applied)
    for (const effect of ordered) {
      effect.status = 'failed'
      effect.skipReason = null
    }
    applied.length = 0
  }

  const cards = proposal.cards.map((card) => ({
    ...card,
    status: cardStatus(card, effects),
  }))
  const appliedCards = cards.filter(
    (card) => card.status === 'applied' || card.status === 'partial'
  ).length
  const skippedCards = cards.filter(
    (card) => card.status === 'skipped' || card.status === 'partial'
  ).length
  const everyCardApplied = cards.every((card) => card.status === 'applied')
  const status: ScribeApplyResult['status'] = error
    ? 'failed'
    : everyCardApplied
      ? 'applied'
      : 'partially_applied'
  const next: StoredProposal = {
    ...proposal,
    status: error
      ? 'failed'
      : status === 'applied'
        ? 'applied'
        : 'partially_applied',
    effects: proposal.effects.map((effect) => effects.get(effect.id)!),
    cards,
    resolvedAt: deps.now.getTime(),
  }
  const bindings = error
    ? []
    : [...ctx.bound.entries()].map(([ref, id]) => ({ ref, id }))
  return {
    proposal: next,
    result: {
      status,
      appliedCards: error ? 0 : appliedCards,
      skippedCards: error ? 0 : skippedCards,
    },
    applied,
    bindings,
    outcome: outcomeBlock(next, status),
    error,
  }
}
