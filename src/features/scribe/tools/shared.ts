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

/**
 * Helpers the tool files share: schema pieces, date math on local `YYYY-MM-DD`
 * days, and Ref resolution with errors that tell the model how to fix its call.
 * Not a tool; the registry guard skips it.
 */

// ---------------------------------------------------------------- schema pieces

export const day = z.iso.date()
export const optionalDay = z.iso.date().nullable()
/** The User's literal phrase, shown as `from "next Tuesday"`. */
export const spoken = z.string().max(40).nullable()
export const ref = z.string().min(2).max(12)
export const optionalRef = z.string().min(2).max(12).nullable()

// ---------------------------------------------------------------- dates

export const parseDay = (value: string): moment.Moment =>
  moment(value, 'YYYY-MM-DD', true)

/** Whole days from `from` to `to` (local days). */
export const daysBetween = (from: string, to: string): number =>
  parseDay(to).diff(parseDay(from), 'days')

export const addDays = (value: string, count: number): string =>
  parseDay(value).add(count, 'days').format('YYYY-MM-DD')

/** A local Date for a stored-day action (store actions anchor it). */
export const localDate = (value: string): Date => {
  const m = parseDay(value)
  return new Date(m.year(), m.month(), m.date(), 12)
}

/** `from`…`to` with defaults, validated against a maximum span. */
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

// ---------------------------------------------------------------- names

/** `normalizeReconcileName`: trim, lowercase, collapse whitespace. */
export const normalizeName = (name: string): string =>
  name.trim().toLowerCase().replace(/\s+/g, ' ')

/** Also accent-insensitive, for search. */
export const foldText = (value: string): string =>
  normalizeName(value).normalize('NFD').replace(/[̀-ͯ]/g, '')

export const oneLine = (value: string, max: number): string => {
  const text = value.replace(/\s+/g, ' ').trim()
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

export const addressLine = (
  address: Address | undefined | null
): string | null => (address ? addressToString(address).trim() || null : null)

// ---------------------------------------------------------------- lists

export function capList<T>(
  items: readonly T[],
  max: number
): { items: T[]; truncated: boolean } {
  return { items: items.slice(0, max), truncated: items.length > max }
}

// ---------------------------------------------------------------- refs

type Resolved<T> = ({ ok: true } & T) | { ok: false; error: string }

const unknownRef = (value: string, hint: string) =>
  `Unknown ${hint} ref ${value}. Use a ref from the context or ${hint === 'contact' ? 'contacts_search' : 'a list tool'}.`

/** A `c` Ref (or a bound `n`) to its Contact. */
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

/** A `k` / `nk` Ref, or null for Standard. */
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

/** A Category a time or plan call drafts along with itself. */
export const newCategoryInput = z
  .strictObject({ name: z.string().min(1).max(40), credit: z.boolean() })
  .nullable()

/**
 * `categoryRef`, or the `newCategory` a call drafts: a name already in the
 * stores uses that Category, one already drafted this turn shares its pending
 * Ref (the later credit wins), and any other gets a new `nk` Ref. `effects` is
 * the `category.create` to propose first, and `ref` the pending Ref to return.
 */
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

// ---------------------------------------------------------------- time

/** `t1 2026-10-02 120m k0 credit note`: a Time Entry as the model reads it. */
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

/** Entries a list shows on a day; also the ones an `onDate` can name. */
export const entriesOnDay = (ctx: ToolContext, date: string): TimeEntry[] =>
  allTimeEntries(ctx.stores.serviceReports)
    .filter((entry) => !entry.rollover && storedDayKey(entry.date) === date)
    .sort((a, b) => a.id.localeCompare(b.id))

/** Entries an `onDate` error lists. */
const MAX_LISTED_ENTRIES = 6

/**
 * The Time Entry a `t` Ref or an `onDate` names: the only entry that day, or an
 * error listing the day's entries so the model can pick or ask.
 */
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

/** A Time Entry's Category as a draft names it. */
export const entryCategory = (entry: TimeEntry): CategoryTarget =>
  entry.categoryId
    ? { type: 'existing', id: entry.categoryId }
    : { type: 'standard' }

// ---------------------------------------------------------------- visits

/** Visits for one Contact, newest first. */
export const visitsFor = (
  visits: readonly Visit[],
  contactId: string
): Visit[] =>
  visits
    .filter((visit) => visit.contact.id === contactId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

/** The soonest Follow-up still ahead (today included), not dismissed. */
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

// ---------------------------------------------------------------- contacts

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

/** The parts that were given, or null when none were. */
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

/** Data protection mode needs the householder's consent, given in the form. */
export const PROTECTED_CREATE_ERROR =
  "Data protection mode is on, so new contacts need the householder's consent in the contact form. Tell the User to add this person there, then log the visit."
