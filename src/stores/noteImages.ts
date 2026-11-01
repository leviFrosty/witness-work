import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import useSharedCars from '@/stores/sharedCars'
import useServiceReport from '@/stores/serviceReport'
import { richTextImages } from '@/lib/richText/inspect'
import { deleteNoteImages } from '@/lib/richText/noteImages'
import { parseRichText } from '@/lib/richText/parse'
import type { NoteFields } from '@/types/richText'

function addImages(ids: Set<string>, record: NoteFields | undefined) {
  if (!record?.noteDoc) return

  const rich = parseRichText(record.noteDoc)
  if (!rich) return
  for (const image of richTextImages(rich.doc)) ids.add(image.id)
}

const extraReferences = new Set<() => Iterable<string>>()

export function addNoteImageReferences(
  provider: () => Iterable<string>
): () => void {
  extraReferences.add(provider)
  return () => extraReferences.delete(provider)
}

export function referencedNoteImageIds(): Set<string> {
  const ids = new Set<string>()
  for (const provider of extraReferences) {
    for (const id of provider()) ids.add(id)
  }
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
  for (const car of Object.values(useSharedCars.getState().cars)) {
    for (const trip of car.trips) addImages(ids, trip)
  }
  return ids
}

export function noteImageIdsOf(
  records: (NoteFields | undefined)[]
): Set<string> {
  const ids = new Set<string>()
  for (const record of records) addImages(ids, record)
  return ids
}

export async function deleteUnreferencedNoteImages(
  ids: Set<string>
): Promise<void> {
  if (!ids.size) return
  const referenced = referencedNoteImageIds()
  await deleteNoteImages([...ids].filter((id) => !referenced.has(id)))
}
