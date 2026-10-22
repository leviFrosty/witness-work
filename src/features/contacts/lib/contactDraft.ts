import type { Contact } from '@/types/contact'

/**
 * The contact form's draft as Discard Changes compares it. Opening the form,
 * the phone field fills in a region for a saved contact that has none (contacts
 * from before regions existed, or imported ones), so that region doesn't count
 * as a change while the phone number stays as it was.
 */
export function contactDraftForChanges(
  draft: Contact,
  saved: Contact | undefined
): Contact {
  if (!saved || saved.phoneRegionCode || draft.phone !== saved.phone)
    return draft
  return { ...draft, phoneRegionCode: saved.phoneRegionCode }
}
