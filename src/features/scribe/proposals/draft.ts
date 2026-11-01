import moment from 'moment'
import type { ScribeWarning } from '@/features/scribe/types'
import type { ScribeContextWire } from '@/features/scribe/lib/wire'
import type { DraftView } from '@/features/scribe/tools/types'
import { emptyRefTable, RefRegistry } from '@/features/scribe/runtime/refs'
import {
  allTimeEntries,
  plansOnDay,
  type ScribeStores,
} from '@/features/scribe/runtime/snapshot'
import { normalizeName, parseDay } from '@/features/scribe/tools/shared'
import type {
  CategoryTarget,
  DraftEffect,
  StoredEffect,
} from '@/features/scribe/proposals/model'
import { entryMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'
import {
  getMonthsReports,
  getTotalMinutesDetailedForSpecificMonth,
} from '@/lib/serviceReport'
import { publisherCapabilitiesForMonth } from '@/lib/roleHistory'

export class TurnDraft implements DraftView {
  private readonly stored: StoredEffect[]

  constructor(
    readonly proposalId: string,
    private readonly refs: RefRegistry,

    existing: readonly StoredEffect[] = []
  ) {
    this.stored = structuredClone([...existing])
  }

  get effects(): DraftEffect[] {
    return this.stored.map((effect) => effect.draft)
  }

  get size(): number {
    return this.stored.length
  }

  storedEffects(): StoredEffect[] {
    return structuredClone(this.stored)
  }

  checkpoint(): StoredEffect[] {
    return this.storedEffects()
  }

  rollback(to: readonly StoredEffect[]): void {
    this.stored.splice(0, this.stored.length, ...structuredClone(to))
  }

  pendingContactRef(name: string): string | null {
    const key = normalizeName(name)
    for (const { draft } of this.stored)
      if (
        draft.kind === 'contact.create' &&
        draft.askBetween === null &&
        normalizeName(draft.name) === key
      )
        return draft.ref
    return null
  }

  pendingCategoryRef(name: string): string | null {
    const key = normalizeName(name)
    for (const { draft } of this.stored)
      if (draft.kind === 'category.create' && normalizeName(draft.name) === key)
        return draft.ref
    return null
  }

  pendingName(ref: string): string | null {
    for (const { draft } of this.stored)
      if (
        (draft.kind === 'contact.create' || draft.kind === 'category.create') &&
        draft.ref === ref
      )
        return draft.name
    return null
  }

  mintRef(kind: 'n' | 'nk'): string {
    return this.refs.issuePending(kind, this.proposalId)
  }

  add(
    callId: string,
    effects: readonly DraftEffect[],
    stores: ScribeStores,
    context: ScribeContextWire
  ): void {
    effects.forEach((draft, index) => {
      if (draft.kind === 'contact.create' || draft.kind === 'category.create') {
        const same = this.stored.find(
          (effect) =>
            effect.draft.kind === draft.kind &&
            'ref' in effect.draft &&
            effect.draft.ref === draft.ref
        )
        if (same) {
          same.draft = mergeCreate(same.draft, draft)
          if (!same.callIds.includes(callId)) same.callIds.push(callId)
          return
        }
      }
      this.stored.push({
        id: `${callId}:${index}`,
        callIds: [callId],
        draft,
        warnings: warningsFor(draft, stores, context, this.effects),
        status: 'pending',
        skipReason: null,
      })
    })
  }
}

function mergeCreate(first: DraftEffect, later: DraftEffect): DraftEffect {
  if (first.kind === 'contact.create' && later.kind === 'contact.create')
    return {
      ...first,
      address: later.address ?? first.address,
      phone: later.phone ?? first.phone,
      email: later.email ?? first.email,
    }
  if (first.kind === 'category.create' && later.kind === 'category.create')
    return { ...first, credit: later.credit }
  return first
}

const minutesOf = (stores: ScribeStores, effect: { date: string }) =>
  allTimeEntries(stores.serviceReports).filter(
    (entry) => !entry.rollover && storedDayKey(entry.date) === effect.date
  )

const isCredit = (
  category: CategoryTarget,
  stores: ScribeStores,
  drafted: readonly DraftEffect[]
): boolean => {
  if (category.type === 'standard') return false
  if (category.type === 'existing')
    return (
      stores.categories.find((c) => c.id === category.id)?.isCredit ?? false
    )
  return drafted.some(
    (effect) =>
      effect.kind === 'category.create' &&
      effect.ref === category.ref &&
      effect.credit
  )
}

const overlaps = (
  aStart: number,
  aMinutes: number,
  bStart: number,
  bMinutes: number
) => aStart < bStart + bMinutes && bStart < aStart + aMinutes

export function warningsFor(
  effect: DraftEffect,
  stores: ScribeStores,
  context: ScribeContextWire,
  drafted: readonly DraftEffect[]
): ScribeWarning[] {
  const warnings: ScribeWarning[] = []
  if (effect.kind === 'time.create') {
    if (!context.publisher.showsTimeEntry) {
      warnings.push({ code: 'shared_month', severity: 'info' })
      return warnings
    }
    if (
      minutesOf(stores, effect).some(
        (entry) => entryMinutes(entry) === effect.minutes
      )
    )
      warnings.push({ code: 'duplicate_time', severity: 'warning' })
    if (isCredit(effect.category, stores, drafted)) {
      const day = parseDay(effect.date)
      const target = { year: day.year(), month: day.month() }
      const cap = publisherCapabilitiesForMonth(
        stores.preferences,
        target
      ).creditCapMinutes
      if (cap !== null) {
        const { standard, credit } = getTotalMinutesDetailedForSpecificMonth(
          getMonthsReports(stores.serviceReports, target.month, target.year),
          target.month,
          target.year
        )
        if (standard + credit + effect.minutes > cap)
          warnings.push({ code: 'over_credit_cap', severity: 'warning' })
      }
    }
    return warnings
  }
  if (effect.kind === 'plan.create' || effect.kind === 'plan.update') {
    const date =
      effect.kind === 'plan.create'
        ? effect.date
        : (effect.set.date ?? effect.planDate)
    const start =
      effect.kind === 'plan.create'
        ? effect.startMinutes
        : effect.set.startMinutes !== undefined
          ? effect.set.startMinutes
          : (effect.before.startMinutes ?? currentStart(stores, effect.planId))
    const anytime =
      effect.kind === 'plan.create'
        ? effect.anytime
        : (effect.set.anytime ?? isAnytime(stores, effect.planId))
    const minutes =
      effect.kind === 'plan.create'
        ? effect.minutes
        : (effect.set.minutes ?? currentMinutes(stores, effect.planId))
    if (anytime || start === null) return warnings
    const others = plansOnDayQuiet(stores, date).filter(
      (plan) =>
        !(effect.kind === 'plan.update' && plan.plan.id === effect.planId) &&
        plan.startMinutes !== null
    )
    if (
      others.some((plan) =>
        overlaps(start, minutes, plan.startMinutes!, plan.minutes)
      )
    )
      warnings.push({ code: 'plan_overlap', severity: 'info' })
  }
  return warnings
}

const planById = (stores: ScribeStores, id: string) =>
  stores.dayPlans.find((plan) => plan.id === id)
const currentStart = (stores: ScribeStores, id: string) =>
  planById(stores, id)?.startTimeInMinutes ?? null
const isAnytime = (stores: ScribeStores, id: string) =>
  !!planById(stores, id)?.anytime
const currentMinutes = (stores: ScribeStores, id: string) =>
  planById(stores, id)?.minutes ?? 0

const plansOnDayQuiet = (stores: ScribeStores, date: string) =>
  plansOnDay(stores, new RefRegistry(emptyRefTable()), moment(parseDay(date)))
