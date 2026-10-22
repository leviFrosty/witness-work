import type {
  ScribeCardContact,
  ScribeCardTarget,
  ScribeCategoryLabel,
  ScribeContactChoice,
  ScribeEffect,
  ScribeEffectPreview,
  ScribeFieldChange,
  ScribeProposal,
  ScribeReviewCard,
} from '@/features/scribe/types'
import {
  buddyName,
  contactsByRecency,
  type ScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { addressLine, normalizeName } from '@/features/scribe/tools/shared'
import type { UndoRecord } from '@/features/scribe/proposals/effects/types'
import type {
  CategoryTarget,
  ContactFields,
  DraftEffect,
  PlanFields,
  StoredCard,
  StoredCardContact,
  StoredEffect,
  StoredProposal,
} from '@/features/scribe/proposals/model'

/**
 * Review cards: a contact card collects one Contact's create or update and
 * every Visit for it; time, plan and category cards hold one effect each. Cards
 * keep the order of each card's first call.
 */

/** Which contact card an effect belongs to, or null for its own card. */
function contactKey(draft: DraftEffect): string | null {
  switch (draft.kind) {
    case 'contact.create':
      return `ref:${draft.ref}`
    case 'contact.update':
      return `id:${draft.contactId}`
    case 'visit.create':
      return draft.contact.type === 'existing'
        ? `id:${draft.contact.id}`
        : `ref:${draft.contact.ref}`
    default:
      return null
  }
}

const CARD_KIND: Record<DraftEffect['kind'], StoredCard['kind']> = {
  'time.create': 'time',
  'plan.create': 'plan',
  'plan.update': 'plan',
  'contact.create': 'contact',
  'contact.update': 'contact',
  'visit.create': 'contact',
  'category.create': 'category',
}

/** Existing Contacts a new one's name matches, most recent first. */
function sameNamed(stores: ScribeStores, name: string): string[] {
  const key = normalizeName(name)
  if (!key) return []
  return contactsByRecency(stores)
    .filter((contact) => normalizeName(contact.name) === key)
    .map((contact) => contact.id)
}

function cardContact(
  key: string,
  effects: readonly StoredEffect[],
  stores: ScribeStores
): StoredCardContact {
  if (key.startsWith('id:'))
    return { type: 'existing', contactId: key.slice(3) }
  const ref = key.slice(4)
  const create = effects.find(
    (effect) =>
      effect.draft.kind === 'contact.create' && effect.draft.ref === ref
  )?.draft
  if (!create || create.kind !== 'contact.create') return { type: 'new', ref }
  const optionIds = create.askBetween ?? sameNamed(stores, create.name)
  if (!optionIds.length) return { type: 'new', ref }
  return {
    type: 'choice',
    spokenName: create.name,
    optionIds,
    newRef: ref,
    chosen: null,
  }
}

/** The cards for a turn's effects, all selected. */
export function buildCards(
  effects: readonly StoredEffect[],
  stores: ScribeStores
): StoredCard[] {
  const cards: StoredCard[] = []
  const byKey = new Map<string, StoredCard>()
  for (const effect of effects) {
    const key = contactKey(effect.draft)
    if (key) {
      let card = byKey.get(key)
      if (!card) {
        card = {
          id: `card-${effect.id}`,
          kind: 'contact',
          contact: cardContact(key, effects, stores),
          effectIds: [],
          selected: true,
          status: 'pending',
        }
        byKey.set(key, card)
        cards.push(card)
      }
      card.effectIds.push(effect.id)
      continue
    }
    cards.push({
      id: `card-${effect.id}`,
      kind: CARD_KIND[effect.draft.kind],
      contact: null,
      effectIds: [effect.id],
      selected: true,
      status: 'pending',
    })
  }
  // The Contact's own create or update leads its card, then its Visits.
  const rank = (id: string) => {
    const kind = effects.find((effect) => effect.id === id)?.draft.kind
    return kind === 'visit.create' ? 1 : 0
  }
  for (const card of cards)
    if (card.kind === 'contact')
      card.effectIds = [...card.effectIds].sort((a, b) => rank(a) - rank(b))
  return cards
}

/**
 * Rebuilds cards after a retried turn added effects, keeping what the User
 * already picked on the cards that were there.
 */
export function mergeCards(
  previous: readonly StoredCard[],
  next: readonly StoredCard[]
): StoredCard[] {
  const before = new Map(previous.map((card) => [card.id, card]))
  return next.map((card) => {
    const old = before.get(card.id)
    if (!old) return card
    return {
      ...card,
      selected: old.selected,
      contact:
        card.contact?.type === 'choice' && old.contact?.type === 'choice'
          ? { ...card.contact, chosen: old.contact.chosen }
          : card.contact,
    }
  })
}

export const needsChoice = (card: StoredCard): boolean =>
  card.selected &&
  card.contact?.type === 'choice' &&
  card.contact.chosen === null

export function proposalCounts(proposal: StoredProposal): {
  selected: number
  ready: number
  needsChoice: number
} {
  let selected = 0
  let blocked = 0
  for (const card of proposal.cards) {
    if (!card.selected || card.status !== 'pending') continue
    selected++
    if (needsChoice(card)) blocked++
  }
  return { selected, ready: selected - blocked, needsChoice: blocked }
}

/** Status pending, something selected, and no unresolved choice. */
export const canAddProposal = (proposal: StoredProposal): boolean => {
  const counts = proposalCounts(proposal)
  return (
    proposal.status === 'pending' &&
    counts.selected > 0 &&
    counts.needsChoice === 0
  )
}

export function withCardToggled(
  proposal: StoredProposal,
  cardId: string
): StoredProposal {
  if (proposal.status !== 'pending') return proposal
  return {
    ...proposal,
    cards: proposal.cards.map((card) =>
      card.id === cardId ? { ...card, selected: !card.selected } : card
    ),
  }
}

/** Picks an option on a choice card, and selects it. */
export function withContactChosen(
  proposal: StoredProposal,
  cardId: string,
  choice: ScribeContactChoice
): StoredProposal {
  if (proposal.status !== 'pending') return proposal
  return {
    ...proposal,
    cards: proposal.cards.map((card) => {
      if (card.id !== cardId || card.contact?.type !== 'choice') return card
      if (
        choice.type === 'existing' &&
        !card.contact.optionIds.includes(choice.contactId)
      )
        return card
      return {
        ...card,
        selected: true,
        contact: { ...card.contact, chosen: choice },
      }
    }),
  }
}

// ---------------------------------------------------------------- previews

function categoryLabel(
  target: CategoryTarget,
  stores: ScribeStores,
  effects: readonly StoredEffect[]
): ScribeCategoryLabel | null {
  if (target.type === 'standard') return null
  if (target.type === 'existing') {
    const category = stores.categories.find((c) => c.id === target.id)
    return category ? { name: category.name, credit: category.isCredit } : null
  }
  const create = effects.find(
    (effect) =>
      effect.draft.kind === 'category.create' && effect.draft.ref === target.ref
  )?.draft
  return create?.kind === 'category.create'
    ? { name: create.name, credit: create.credit }
    : null
}

function planChanges(set: PlanFields, before: PlanFields): ScribeFieldChange[] {
  const changes: ScribeFieldChange[] = []
  if (set.date !== undefined)
    changes.push({ field: 'date', before: before.date ?? '', after: set.date })
  if (set.minutes !== undefined)
    changes.push({
      field: 'minutes',
      before: before.minutes ?? 0,
      after: set.minutes,
    })
  if (set.startMinutes !== undefined)
    changes.push({
      field: 'startMinutes',
      before: before.startMinutes ?? null,
      after: set.startMinutes,
    })
  if (set.anytime !== undefined)
    changes.push({
      field: 'anytime',
      before: before.anytime ?? false,
      after: set.anytime,
    })
  if (set.title !== undefined)
    changes.push({
      field: 'title',
      before: before.title ?? null,
      after: set.title,
    })
  if (set.note !== undefined)
    changes.push({
      field: 'note',
      before: before.note ?? null,
      after: set.note,
    })
  return changes
}

function contactChanges(
  set: ContactFields,
  before: ContactFields
): ScribeFieldChange[] {
  const changes: ScribeFieldChange[] = []
  if (set.name !== undefined)
    changes.push({
      field: 'name',
      before: before.name ?? null,
      after: set.name,
    })
  if (set.phone !== undefined)
    changes.push({
      field: 'phone',
      before: before.phone ?? null,
      after: set.phone,
    })
  if (set.email !== undefined)
    changes.push({
      field: 'email',
      before: before.email ?? null,
      after: set.email,
    })
  if (set.address !== undefined)
    changes.push({
      field: 'address',
      before: addressLine(before.address),
      after: addressLine(set.address),
    })
  return changes
}

function preview(
  draft: DraftEffect,
  stores: ScribeStores,
  effects: readonly StoredEffect[]
): ScribeEffectPreview {
  switch (draft.kind) {
    case 'time.create':
      return {
        kind: draft.kind,
        date: draft.date,
        minutes: draft.minutes,
        category: categoryLabel(draft.category, stores, effects),
        note: draft.note,
        spoken: draft.spoken,
      }
    case 'plan.create':
      return {
        kind: draft.kind,
        date: draft.date,
        minutes: draft.minutes,
        startMinutes: draft.startMinutes,
        anytime: draft.anytime,
        category: categoryLabel(draft.category, stores, effects),
        title: draft.title,
        note: draft.note,
        spoken: draft.spoken,
        inviteNames: (draft.inviteHint ?? []).flatMap((inboxId) => {
          const buddy = stores.buddies.find((b) => b.inboxId === inboxId)
          return buddy ? [buddyName(buddy)] : []
        }),
      }
    case 'plan.update':
      return {
        kind: draft.kind,
        date: draft.planDate,
        title: draft.planTitle,
        changes: planChanges(draft.set, draft.before),
        spoken: draft.spoken,
      }
    case 'contact.create':
      return {
        kind: draft.kind,
        name: draft.name,
        address: addressLine(draft.address),
        phone: draft.phone,
        email: draft.email,
      }
    case 'contact.update':
      return {
        kind: draft.kind,
        name: draft.contactName,
        changes: contactChanges(draft.set, draft.before),
      }
    case 'visit.create':
      return {
        kind: draft.kind,
        date: draft.date,
        notAtHome: draft.notAtHome,
        bibleStudy: draft.bibleStudy,
        note: draft.note,
        followUp: draft.followUp,
        spoken: draft.spoken,
      }
    case 'category.create':
      return { kind: draft.kind, name: draft.name, credit: draft.credit }
  }
}

function publicContact(
  contact: StoredCardContact,
  stores: ScribeStores,
  effects: readonly StoredEffect[]
): ScribeCardContact {
  const option = (contactId: string) => {
    const found = stores.contacts.find((c) => c.id === contactId)
    return {
      contactId,
      name: found?.name ?? '',
      addressLine: addressLine(found?.address),
    }
  }
  if (contact.type === 'existing')
    return { type: 'existing', ...option(contact.contactId) }
  if (contact.type === 'choice')
    return {
      type: 'choice',
      spokenName: contact.spokenName,
      options: contact.optionIds.map(option),
      chosen: contact.chosen,
    }
  const create = effects.find(
    (effect) =>
      effect.draft.kind === 'contact.create' && effect.draft.ref === contact.ref
  )?.draft
  return create?.kind === 'contact.create'
    ? {
        type: 'new',
        name: create.name,
        addressLine: addressLine(create.address),
      }
    : { type: 'new', name: '', addressLine: null }
}

const publicEffect = (
  effect: StoredEffect,
  stores: ScribeStores,
  effects: readonly StoredEffect[]
): ScribeEffect => ({
  id: effect.id,
  kind: effect.draft.kind,
  preview: preview(effect.draft, stores, effects),
  warnings: effect.warnings,
  status: effect.status,
  skipReason: effect.skipReason,
})

/**
 * The record an added card wrote, while it's still there: its Contact (and the
 * Visit it logged), or its Plan. Time and Category cards have none.
 */
function cardTarget(
  card: StoredCard,
  undos: ReadonlyMap<string, UndoRecord>,
  stores: ScribeStores
): ScribeCardTarget | null {
  if (card.status !== 'applied' && card.status !== 'partial') return null
  const records = card.effectIds.flatMap((id) => {
    const undo = undos.get(id)
    return undo ? [undo] : []
  })
  if (card.kind === 'contact') {
    const created = records.find((undo) => undo.kind === 'contact.create')
    const contactId =
      card.contact?.type === 'existing'
        ? card.contact.contactId
        : card.contact?.type === 'choice' &&
            card.contact.chosen?.type === 'existing'
          ? card.contact.chosen.contactId
          : created?.kind === 'contact.create'
            ? created.contactId
            : null
    if (!contactId || !stores.contacts.some((c) => c.id === contactId))
      return null
    const logged = records.find((undo) => undo.kind === 'visit.create')
    const visitId =
      logged?.kind === 'visit.create' &&
      stores.visits.some((visit) => visit.id === logged.visitId)
        ? logged.visitId
        : null
    return { type: 'contact', contactId, visitId }
  }
  if (card.kind === 'plan') {
    const plan = records.find(
      (undo) => undo.kind === 'plan.create' || undo.kind === 'plan.update'
    )
    const planId =
      plan?.kind === 'plan.create' || plan?.kind === 'plan.update'
        ? plan.planId
        : null
    return planId && stores.dayPlans.some((p) => p.id === planId)
      ? { type: 'plan', planId }
      : null
  }
  return null
}

/**
 * What the review screen renders. `applied` is the Add's undo records, which
 * name what it wrote.
 */
export function toScribeProposal(
  proposal: StoredProposal,
  stores: ScribeStores,
  applied: readonly { effectId: string; undo: UndoRecord }[] = []
): ScribeProposal {
  const byId = new Map(proposal.effects.map((effect) => [effect.id, effect]))
  const undos = new Map(applied.map(({ effectId, undo }) => [effectId, undo]))
  const cards: ScribeReviewCard[] = proposal.cards.map((card) => ({
    id: card.id,
    kind: card.kind,
    contact: card.contact
      ? publicContact(card.contact, stores, proposal.effects)
      : null,
    effects: card.effectIds
      .map((id) => byId.get(id))
      .filter((effect): effect is StoredEffect => !!effect)
      .map((effect) => publicEffect(effect, stores, proposal.effects)),
    selected: card.selected,
    needsChoice: needsChoice(card),
    status: card.status,
    target: cardTarget(card, undos, stores),
  }))
  return {
    id: proposal.id,
    conversationId: proposal.conversationId,
    createdAt: proposal.createdAt,
    status: proposal.status,
    cards,
    invalidCount: proposal.invalidCount,
    tainted: proposal.tainted,
    undoKept: proposal.undoKept ?? 0,
  }
}
