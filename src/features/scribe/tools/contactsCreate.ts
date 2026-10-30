import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  addressInput,
  emailInput,
  phoneInput,
  toAddress,
} from '@/features/scribe/tools/shared'

export default defineWriteTool({
  name: 'contacts_create',
  area: 'contacts',
  description:
    'Propose a new Contact (a householder) with what the User said: name, and address, phone or email when given. Use visits_log with newContact instead when logging a conversation with someone new. Returns a pending ref (n1).',
  input: z.strictObject({
    name: z.string().min(1).max(80),
    address: addressInput,
    phone: phoneInput,
    email: emailInput,
  }),
  propose: (input, ctx) => {
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'name is empty.' }
    // A second mention of the same new person fills in the first.
    const ref = ctx.draft.pendingContactRef(name) ?? ctx.draft.mintRef('n')
    return {
      ok: true,
      ref,
      effects: [
        {
          kind: 'contact.create',
          ref,
          name,
          address: toAddress(input.address),
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          askBetween: null,
          // The householder's consent, confirmed on the card.
          ...(ctx.dataProtection ? { needsConsent: true } : {}),
        },
      ],
    }
  },
})
