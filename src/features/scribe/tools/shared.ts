import moment from 'moment'
import { z } from 'zod/v4'
import type { Contact, Address } from '@/types/contact'
import type { Visit } from '@/types/visit'
import type { TimeEntry } from '@/types/timeEntry'
import { addressToString } from '@/lib/addressToString'
import { entryMinutes } from '@/lib/entryMinutes'
import { storedDayKey } from '@/lib/normalizeDate'
import { hasNote } from '@/lib/richText/notes'
import { isLdcEntry } from '@/lib/serviceReportCategory'
import type { ToolContext } from '@/features/scribe/tools/types'
import type {
  CategoryTarget,
  ContactTarget,
  DraftEffect,
} from '@/features/scribe/proposals/model'
import {
  allTimeEntries,
  categoryRef,
  localDayKey,
} from '@/features/scribe/runtime/snapshot'

export const day = z.iso.date()
export const optionalDay = z.iso.date().nullable()

export const spoken = z.string().max(40).nullable()
export const ref = z.string().min(2).max(12)
export const optionalRef = z.string().min(2).max(12).nullable()

export const parseDay = (value: string): moment.Moment =>
  moment(value, 'YYYY-MM-DD', true)

export const daysBetween = (from: string, to: string): number =>
  parseDay(to).diff(parseDay(from), 'days')

export const addDays = (value: string, count: number): string =>
  parseDay(value).add(count, 'days').format('YYYY-MM-DD')

export const localDate = (value: string): Date => {
  const m = parseDay(value)
  return new Date(m.year(), m.month(), m.date(), 12)
}

export function dayRange(
  ctx: ToolContext,
  from: string | null,
  to: string | null,
  defaults: { from: string; to: string },
  maxDays: number
): { ok: true; from: string; to: string } | { ok: false; error: string } {
  const start = from ?? defaults.from
  const end = to ?? defaults.to
  if (daysBetween(start, end) < 0)
    return { ok: false, error: '`from` must be on or before `to`.' }
  if (daysBetween(start, end) >= maxDays)
    return {
      ok: false,
      error: `The range can cover at most ${maxDays} days. Ask for a shorter one.`,
    }
  void ctx
  return { ok: true, from: start, to: end }
}

export const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

export const foldText = (value: string): string =>
  normalizeName(value).normalize('NFD').replace(/[̀-ͯ]/g, '')

export const oneLine = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const addressLine = (
  address: Address | undefined | null
): string | null => (address ? addressToString(address).trim() || null : null)

export function capList<T>(
  items: readonly T[],
  max: number
): { items: T[]; truncated: boolean } {
  return { items: items.slice(0, max), truncated: items.length > max }
}

type Resolved<T> = ({ ok: true } & T) | { ok: false; error: string }

const unknownRef = (value: string, hint: string) =>
  `Unknown ${hint} ref ${value}. Use a ref from the context or ${hint === 'contact' ? 'contacts_search' : 'a list tool'}.`

export function resolveContact(
  ctx: ToolContext,
  value: string,
  options: { allowPending: boolean }
): Resolved<{ target: ContactTarget; contact: Contact | null; name: string }> {
  const resolved = ctx.refs.resolve(value)
  if (!resolved || (resolved.kind !== 'c' && resolved.kind !== 'n'))
    return { ok: false, error: unknownRef(value, 'contact') }
  if (resolved.kind === 'n') {
    if (!options.allowPending)
      return {
        ok: false,
        error: `${value} isn't added yet. Put the details in the contacts_create or visits_log call that creates it.`,
      }
    const name = ctx.draft.pendingName(value)
    if (resolved.pending.proposalId !== ctx.draft.proposalId || name === null)
      return {
        ok: false,
        error: `${value} was in a proposal that wasn't added. Create the contact again.`,
      }
    return {
      ok: true,
      target: { type: 'pending', ref: value },
      contact: null,
      name,
    }
  }
  const contact = ctx.stores.contacts.find((c) => c.id === resolved.id)
  if (!contact)
    return {
      ok: false,
      error: `Contact ${value} no longer exists. Search again with contacts_search.`,
    }
  return {
    ok: true,
    target: { type: 'existing', id: contact.id },
    contact,
    name: contact.name,
  }
}

export function resolveCategory(
  ctx: ToolContext,
  value: string | null
): Resolved<{ target: CategoryTarget; credit: boolean }> {
  if (value === null)
    return { ok: true, target: { type: 'standard' }, credit: false }
  const resolved = ctx.refs.resolve(value)
  if (!resolved || (resolved.kind !== 'k' && resolved.kind !== 'nk'))
    return {
      ok: false,
      error: `Unknown category ref ${value}. Use one from the context's categories, or null for Standard.`,
    }
  if (resolved.kind === 'nk') {
    if (
      resolved.pending.proposalId !== ctx.draft.proposalId ||
      ctx.draft.pendingName(value) === null
    )
      return {
        ok: false,
        error: `${value} was in a proposal that wasn't added. Create the category again with categories_create.`,
      }
    const credit = ctx.draft.effects.some(
      (effect) =>
        effect.kind === 'category.create' &&
        effect.ref === value &&
        effect.credit
    )
    return { ok: true, target: { type: 'pending', ref: value }, credit }
  }
  if (resolved.id === null)
    return { ok: true, target: { type: 'standard' }, credit: false }
  const category = ctx.stores.categories.find((c) => c.id === resolved.id)
  if (!category)
    return {
      ok: false,
      error: `Category ${value} no longer exists. Use null for Standard or another category.`,
    }
  return {
    ok: true,
    target: { type: 'existing', id: category.id },
    credit: category.isCredit,
  }
}

export const newCategoryInput = z
  .strictObject({ name: z.string().min(1).max(40), credit: z.boolean() })
  .nullable()

export function categoryFor(
  ctx: ToolContext,
  categoryRef: string | null,
  newCategory: z.output<typeof newCategoryInput>
): Resolved<{
  target: CategoryTarget
  effects: DraftEffect[]
  ref?: string
}> {
  if (!newCategory) {
    const category = resolveCategory(ctx, categoryRef)
    return category.ok ? { ...category, effects: [] } : category
  }
  if (categoryRef !== null)
    return {
      ok: false,
      error: 'Send categoryRef or newCategory, not both; the other null.',
    }
  const name = newCategory.name.trim()
  if (!name) return { ok: false, error: 'newCategory.name is empty.' }
  const existing = ctx.stores.categories.find(
    (category) => normalizeName(category.name) === normalizeName(name)
  )
  if (existing)
    return {
      ok: true,
      target: { type: 'existing', id: existing.id },
      effects: [],
    }
  const ref = ctx.draft.pendingCategoryRef(name) ?? ctx.draft.mintRef('nk')
  return {
    ok: true,
    target: { type: 'pending', ref },
    effects: [
      { kind: 'category.create', ref, name, credit: newCategory.credit },
    ],
    ref,
  }
}

export function entryLine(ctx: ToolContext, entry: TimeEntry): string {
  const flags = [
    ...(entry.credit || isLdcEntry(entry) ? ['credit'] : []),
    ...(hasNote(entry) ? ['note'] : []),
  ]
  return [
    ctx.refs.issue('t', entry.id),
    storedDayKey(entry.date),
    `${entryMinutes(entry)}m`,
    categoryRef(ctx.refs, ctx.stores.categories, entry.categoryId),
    ...flags,
  ].join(' ')
}

export const entriesOnDay = (ctx: ToolContext, date: string): TimeEntry[] =>
  allTimeEntries(ctx.stores.serviceReports)
    .filter((entry) => !entry.rollover && storedDayKey(entry.date) === date)
    .sort((a, b) => a.id.localeCompare(b.id))

const MAX_LISTED_ENTRIES = 6

export function resolveEntry(
  ctx: ToolContext,
  entryRef: string | null,
  onDate: string | null
): Resolved<{ entry: TimeEntry }> {
  if ((entryRef === null) === (onDate === null))
    return {
      ok: false,
      error: 'Send exactly one of entryRef or onDate; the other null.',
    }
  if (onDate !== null) {
    const entries = entriesOnDay(ctx, onDate)
    if (entries.length === 1) return { ok: true, entry: entries[0] }
    if (!entries.length)
      return {
        ok: false,
        error: `No time is logged on ${onDate}. Find the entry with time_list.`,
      }
    const listed = entries
      .slice(0, MAX_LISTED_ENTRIES)
      .map((entry) => entryLine(ctx, entry))
      .join(', ')
    return {
      ok: false,
      error: `${onDate} has ${entries.length} entries: ${listed}. Send the entryRef of the one the User means, or ask which.`,
    }
  }
  const resolved = ctx.refs.resolve(entryRef!)
  if (!resolved || resolved.kind !== 't')
    return {
      ok: false,
      error: `Unknown entry ref ${entryRef}. Use a t ref from time_list.`,
    }
  const entry = allTimeEntries(ctx.stores.serviceReports).find(
    (candidate) => candidate.id === resolved.id
  )
  if (!entry)
    return {
      ok: false,
      error: `Entry ${entryRef} no longer exists. List the time again.`,
    }
  if (entry.rollover)
    return {
      ok: false,
      error:
        'That entry moves minutes between months and can only be changed in the app.',
    }
  return { ok: true, entry }
}

export const entryCategory = (entry: TimeEntry): CategoryTarget =>
  entry.categoryId
    ? { type: 'existing', id: entry.categoryId }
    : { type: 'standard' }

export const visitsFor = (
  visits: readonly Visit[],
  contactId: string
): Visit[] =>
  visits
    .filter((visit) => visit.contact.id === contactId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

export function nextFollowUp(
  visits: readonly Visit[],
  today: string
): { date: string; topic: string | null } | null {
  let best: { date: string; topic: string | null } | null = null
  for (const visit of visits) {
    const followUp = visit.followUp
    if (!followUp || followUp.dismissed) continue
    const date = localDayKey(followUp.date)
    if (date < today) continue
    if (!best || date < best.date)
      best = {
        date,
        topic: followUp.topic ? oneLine(followUp.topic, 120) : null,
      }
  }
  return best
}

const addressPart = z.string().max(120).nullable()

export const addressInput = z
  .strictObject({
    line1: addressPart,
    city: addressPart,
    state: addressPart,
    zip: addressPart,
    country: addressPart,
  })
  .nullable()

export type AddressInput = z.output<typeof addressInput>

export function toAddress(input: AddressInput): Address | null {
  if (!input) return null
  const address: Address = {}
  for (const key of ['line1', 'city', 'state', 'zip', 'country'] as const) {
    const value = input[key]?.trim()
    if (value) address[key] = value
  }
  return Object.keys(address).length ? address : null
}

export const phoneInput = z.string().max(40).nullable()
export const emailInput = z.string().max(120).nullable()

export const PROTECTED_NOT_AT_HOME_ERROR =
  "Data protection mode doesn't keep Not at Home visits. Tell the User in one sentence, and propose anything else they asked for."
