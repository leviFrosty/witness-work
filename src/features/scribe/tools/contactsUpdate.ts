import { z } from 'zod/v4'
import { defineWriteTool } from '@/features/scribe/tools/types'
import {
  addressInput,
  emailInput,
  phoneInput,
  ref,
  resolveContact,
  toAddress,
} from '@/features/scribe/tools/shared'
import type { ContactFields } from '@/features/scribe/proposals/model'
import type { Address } from '@/types/contact'

const sameAddress = (a: Address | null, b: Address | null) =>
  JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})

export default defineWriteTool({
  name: 'contacts_update',
  area: 'contacts',
  description:
    "Propose changes to an existing Contact by its c ref: name, phone, email or address. Every field is null to keep it; address parts that are null keep the saved part. Can't delete a Contact.",
  input: z.strictObject({
    contactRef: ref,
    name: z.string().min(1).max(80).nullable(),
    phone: phoneInput,
    email: emailInput,
    address: addressInput,
  }),
  propose: (input, ctx) => {
    const resolved = resolveContact(ctx, input.contactRef, {
      allowPending: false,
    })
    if (!resolved.ok) return resolved
    const contact = resolved.contact!
    const set: ContactFields = {}
    const before: ContactFields = {}
    const name = input.name?.trim()
    if (name && name !== contact.name) {
      set.name = name
      before.name = contact.name
    }
    const phone = input.phone?.trim()
    if (phone && phone !== (contact.phone ?? '')) {
      set.phone = phone
      before.phone = contact.phone ?? null
    }
    const email = input.email?.trim()
    if (email && email !== (contact.email ?? '')) {
      set.email = email
      before.email = contact.email ?? null
    }
    const parts = toAddress(input.address)
    if (parts) {
      const current = contact.address ?? null
      const next: Address = { ...(current ?? {}), ...parts }
      if (!sameAddress(current, next)) {
        set.address = next
        before.address = current
      }
    }
    if (!Object.keys(set).length)
      return { ok: false, error: 'Nothing would change on this contact.' }
    return {
      ok: true,
      effects: [
        {
          kind: 'contact.update',
          contactId: contact.id,
          contactName: contact.name,
          expectUpdatedAt: contact.updatedAt ?? null,
          set,
          before,
        },
      ],
    }
  },
})
