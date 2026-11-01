import type { Contact } from '@/types/contact'

export function contactDraftForChanges(
  draft: Contact,
  saved: Contact | undefined
): Contact {
  if (!saved || saved.phoneRegionCode || draft.phone !== saved.phone)
    return draft
  return { ...draft, phoneRegionCode: saved.phoneRegionCode }
}
