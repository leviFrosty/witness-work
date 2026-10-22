import { z } from 'zod/v4'
import { defineReadTool } from '@/features/scribe/tools/types'
import {
  addressLine,
  nextFollowUp,
  ref,
  resolveContact,
  visitsFor,
} from '@/features/scribe/tools/shared'
import { localDayKey } from '@/features/scribe/runtime/snapshot'

export default defineReadTool({
  name: 'contacts_get',
  area: 'contacts',
  description:
    "Details of one Contact by ref: address, whether a phone or email is saved, how many visits, the last visit and the next follow-up. Use it to answer questions about one; changing or visiting a Contact doesn't need it. Never returns notes.",
  input: z.strictObject({ ref }),
  run: ({ ref: value }, ctx) => {
    const resolved = resolveContact(ctx, value, { allowPending: false })
    if (!resolved.ok) return resolved
    const contact = resolved.contact!
    const visits = visitsFor(ctx.stores.visits, contact.id)
    const last = visits[0]
    return {
      ok: true,
      trust: 'app',
      data: {
        ref: value,
        name: contact.name,
        address: ctx.dataProtection ? null : addressLine(contact.address),
        hasPhone: !!contact.phone,
        hasEmail: !!contact.email,
        createdAt: localDayKey(contact.createdAt),
        visitCount: visits.length,
        lastVisit: last
          ? {
              date: localDayKey(last.date),
              notAtHome: !!last.notAtHome,
              bibleStudy: !!last.isBibleStudy,
            }
          : null,
        nextFollowUp: nextFollowUp(visits, ctx.today),
      },
    }
  },
})
