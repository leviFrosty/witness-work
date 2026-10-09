import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import useServiceReport from '@/stores/serviceReport'
import { richTextImages } from '@/lib/richText/inspect'
import { deleteNoteImages } from '@/lib/richText/noteImages'
import { parseRichText } from '@/lib/richText/parse'
import type { NoteFields } from '@/types/richText'

/**
 * Which note photos are still in use, across every store that holds notes.
 * Lives beside the stores because it reads all of them; photo cleanup (local
 * and in the cloud) keeps exactly these.
 */

function addImages(ids: Set<string>, record: NoteFields | undefined) {
  if (!record?.noteDoc) return
  // A stale doc (the note was edited by an older app version) still counts:
  // a device that hasn't caught up may show it.
  const rich = parseRichText(record.noteDoc)
  if (!rich) return
  for (const image of richTextImages(rich.doc)) ids.add(image.id)
}

/** Photo ids every note on this device refers to. */
export function referencedNoteImageIds(): Set<string> {
  const ids = new Set<string>()
  for (const visit of useConversations.getState().conversations) {
    addImages(ids, visit)
  }
  const { serviceReports, dayPlans, recurringPlans } =
    useServiceReport.getState()
  for (const months of Object.values(serviceReports)) {
    for (const entries of Object.values(months)) {
      for (const entry of entries) addImages(ids, entry)
    }
  }
  for (const plan of dayPlans) addImages(ids, plan)
  for (const plan of recurringPlans) {
    addImages(ids, plan)
    for (const override of plan.overrides ?? []) addImages(ids, override)
  }
  for (const trip of useMileage.getState().trips) addImages(ids, trip)
  return ids
}

/** The photo ids in some records' notes. */
export function noteImageIdsOf(
  records: (NoteFields | undefined)[]
): Set<string> {
  const ids = new Set<string>()
  for (const record of records) addImages(ids, record)
  return ids
}

/**
 * Deletes the files of `ids` that no note refers to any more, right away. For
 * erasing householder data, where waiting for cleanup's grace period isn't good
 * enough.
 */
export async function deleteUnreferencedNoteImages(
  ids: Set<string>
): Promise<void> {
  if (!ids.size) return
  const referenced = referencedNoteImageIds()
  await deleteNoteImages([...ids].filter((id) => !referenced.has(id)))
}
