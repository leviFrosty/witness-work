import {
  contactPhotoFilename,
  filenameForNoteImage,
  profilePhotoFilename,
} from '@/lib/syncTransport/imageNames'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import { noteImageIdsOf, referencedNoteImageIds } from '@/stores/noteImages'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import type { NoteFields } from '@/types/richText'

/**
 * The cloud photos each live record refers to, by record, plus every photo any
 * record refers to (`all`, deleted contacts that can still be restored
 * included). Compared across publishes to find the photos a User replaced or
 * removed (`replacedPhotos`).
 */
export type PhotoReferences = {
  byRecord: Map<string, Set<string>>
  all: Set<string>
}

type NoteRecord = NoteFields & { id?: string }

export function currentPhotoReferences(): PhotoReferences {
  const byRecord = new Map<string, Set<string>>()
  const all = new Set<string>()
  const add = (key: string, filenames: Iterable<string>) => {
    const set = byRecord.get(key) ?? new Set<string>()
    for (const filename of filenames) {
      set.add(filename)
      all.add(filename)
    }
    byRecord.set(key, set)
  }
  const notes = (key: string, records: (NoteRecord | undefined)[]) =>
    add(key, [...noteImageIdsOf(records)].map(filenameForNoteImage))

  const { contacts, deletedContacts } = useContacts.getState()
  const listOf = (filename: string | null) => (filename ? [filename] : [])
  for (const contact of contacts)
    add(
      `contact:${contact.id}`,
      listOf(contactPhotoFilename(contact.id, contact.avatar))
    )
  for (const contact of deletedContacts) {
    const filename = contactPhotoFilename(contact.id, contact.avatar)
    if (filename) all.add(filename)
  }
  add('profile', listOf(profilePhotoFilename(useProfile.getState().avatar)))

  for (const visit of useConversations.getState().conversations)
    notes(`visit:${visit.id}`, [visit])
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  for (const months of Object.values(serviceReports))
    for (const entries of Object.values(months))
      for (const entry of entries) notes(`report:${entry.id}`, [entry])
  for (const plan of dayPlans) notes(`dayPlan:${plan.id}`, [plan])
  for (const plan of recurringPlans)
    notes(`recurringPlan:${plan.id}`, [plan, ...(plan.overrides ?? [])])
  for (const trip of useMileage.getState().trips)
    notes(`trip:${trip.id}`, [trip])
  // Photos only a buddy's invitation holds, and the rest `referencedNoteImageIds`
  // keeps.
  for (const id of referencedNoteImageIds()) all.add(filenameForNoteImage(id))
  return { byRecord, all }
}
