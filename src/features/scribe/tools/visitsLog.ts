import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  addDays,
  addressInput,
  day,
  optionalRef,
  phoneInput,
  PROTECTED_CREATE_ERROR,
  ref,
  resolveContact,
  spoken,
  toAddress,
} from '@/features/scribe/tools/shared'
import type {
  ContactTarget,
  DraftEffect,
} from '@/features/scribe/proposals/model'

const FOLLOW_UP_MAX_DAYS = 365

export default defineWriteTool({
  name: 'visits_log',
  area: 'visits',
  description:
    'Propose a Visit (a conversation, or Not at Home) on a day up to today, with an optional Follow-up. Send exactly one of contactRef, newContact (someone new; creates the Contact too) or askBetween (the name fits several Contacts: the User picks). Returns the contact ref.',
  input: z.strictObject({
    contactRef: optionalRef,
    newContact: z
      .strictObject({
        name: z.string().min(1).max(80),
        address: addressInput,
        phone: phoneInput,
      })
      .nullable(),
    askBetween: z
      .strictObject({
        spokenName: z.string().min(1).max(80),
        refs: z.array(ref).min(2).max(5),
      })
      .nullable(),
    date: day,
    notAtHome: z.boolean(),
    bibleStudy: z.boolean(),
    note: z.string().max(1000).nullable(),
    dateSpoken: spoken,
    followUp: z
      .strictObject({
        date: day,
        topic: z.string().max(120).nullable(),
        dateSpoken: spoken,
      })
      .nullable(),
  }),
  propose: (input, ctx) => {
    const targets = [
      input.contactRef,
      input.newContact,
      input.askBetween,
    ].filter((value) => value !== null)
    if (targets.length !== 1)
      return {
        ok: false,
        error:
          'Send exactly one of contactRef, newContact or askBetween; the others null.',
      }
    if (input.date > ctx.today)
      return {
        ok: false,
        error: `${input.date} is after today (${ctx.today}). Log visits that happened; plan a return visit with followUp.`,
      }
    if (input.notAtHome && input.bibleStudy)
      return { ok: false, error: "A Not at Home visit can't be a Bible study." }
    if (input.followUp) {
      if (input.followUp.date < input.date)
        return {
          ok: false,
          error: 'The follow-up date must be on or after the visit.',
        }
      if (input.followUp.date > addDays(ctx.today, FOLLOW_UP_MAX_DAYS))
        return {
          ok: false,
          error: 'The follow-up is too far ahead; plan it within a year.',
        }
    }

    const effects: DraftEffect[] = []
    let contact: ContactTarget
    let contactRef: string
    if (input.contactRef) {
      const resolved = resolveContact(ctx, input.contactRef, {
        allowPending: true,
      })
      if (!resolved.ok) return resolved
      contact = resolved.target
      contactRef = input.contactRef
    } else if (input.newContact) {
      if (ctx.dataProtection)
        return { ok: false, error: PROTECTED_CREATE_ERROR }
      const name = input.newContact.name.trim()
      if (!name) return { ok: false, error: 'newContact.name is empty.' }
      contactRef = ctx.draft.pendingContactRef(name) ?? ctx.draft.mintRef('n')
      effects.push({
        kind: 'contact.create',
        ref: contactRef,
        name,
        address: toAddress(input.newContact.address),
        phone: input.newContact.phone?.trim() || null,
        email: null,
        askBetween: null,
      })
      contact = { type: 'pending', ref: contactRef }
    } else {
      const ask = input.askBetween!
      if (ctx.dataProtection)
        return {
          ok: false,
          error:
            'In data protection mode, find the one contact with contacts_search and send its contactRef.',
        }
      const ids: string[] = []
      for (const option of ask.refs) {
        const resolved = resolveContact(ctx, option, { allowPending: false })
        if (!resolved.ok) return resolved
        if (!ids.includes(resolved.contact!.id)) ids.push(resolved.contact!.id)
      }
      if (ids.length < 2)
        return {
          ok: false,
          error: 'askBetween needs at least two different contacts.',
        }
      // The New option, created only if the User picks it.
      contactRef = ctx.draft.mintRef('n')
      effects.push({
        kind: 'contact.create',
        ref: contactRef,
        name: ask.spokenName.trim(),
        address: null,
        phone: null,
        email: null,
        askBetween: ids,
      })
      contact = { type: 'pending', ref: contactRef }
    }

    effects.push({
      kind: 'visit.create',
      contact,
      date: input.date,
      notAtHome: input.notAtHome,
      bibleStudy: input.bibleStudy,
      note: input.note?.trim() || null,
      followUp: input.followUp
        ? {
            date: input.followUp.date,
            topic: input.followUp.topic?.trim() || null,
            spoken: { date: input.followUp.dateSpoken, time: null },
          }
        : null,
      spoken: { date: input.dateSpoken, time: null },
    })
    return { ok: true, effects, ref: contactRef }
  },
})
