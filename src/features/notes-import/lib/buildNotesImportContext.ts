import moment from 'moment'
import useContacts from '@/stores/contactsStore'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import {
  STANDARD_CATEGORY_ID,
  STANDARD_CATEGORY_NAME,
} from '@/constants/categories'
import type {
  NotesImportContext,
  ExistingContactRef,
  ExistingCategoryRef,
} from '@/features/notes-import/lib/notesImportTypes'

// Bound how many existing contacts we send so the prompt can't balloon for a
// heavy user. Dedupe quality degrades gracefully past this; the model just
// can't match against contacts beyond the cap (it creates new ones + warns).
const MAX_EXISTING_CONTACTS = 1000

const resolveTimeZone = (): string => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Builds the request context the model needs to resolve relative dates and
 * dedupe against the user's existing data. Reads the current store state.
 */
export const buildNotesImportContext = (
  now: Date = new Date()
): NotesImportContext => {
  const categories = useCategories.getState().categories
  const { role, dataProtectionMode } = usePreferences.getState()

  // The dedupe roster is names, addresses and phone numbers of every
  // householder the user has — sent to a third-party model for people who
  // aren't in these notes at all. Data protection mode withholds it; the notes
  // text itself still goes, because the user typed it deliberately for this
  // purpose. Dedupe degrades but does not break: `reconcileMappedImport` runs
  // at Accept time against current local data and re-points uniquely-named
  // matches, so the usual duplicate is still caught before it is committed.
  const contacts = dataProtectionMode ? [] : useContacts.getState().contacts

  const existingContacts: ExistingContactRef[] = contacts
    .slice(0, MAX_EXISTING_CONTACTS)
    .map((c) => {
      const ref: ExistingContactRef = { id: c.id, name: c.name }
      const addressBits = [c.address?.line1, c.address?.city]
        .filter(Boolean)
        .join(', ')
      if (addressBits) ref.address = addressBits
      if (c.phone) ref.phone = c.phone
      return ref
    })

  // Lead with the synthetic "Standard" type so the model has a concrete id to
  // attach ordinary field-service time to, instead of inventing a duplicate
  // "Standard" category. `mapNotesImport` maps this id back to "no category".
  const existingCategories: ExistingCategoryRef[] = [
    {
      id: STANDARD_CATEGORY_ID,
      name: STANDARD_CATEGORY_NAME,
      isCredit: false,
    },
    ...categories.map((c) => ({
      id: c.id,
      name: c.name,
      isCredit: c.isCredit,
    })),
  ]

  return {
    // moment's default format is local ISO-8601 with the UTC offset
    // (e.g. 2026-06-18T09:30:00-05:00) — exactly the shape the model expects.
    now: moment(now).format(),
    timeZone: resolveTimeZone(),
    currentRole: role,
    existingContacts,
    existingCategories,
  }
}
