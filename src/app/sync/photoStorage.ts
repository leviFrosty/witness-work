import { cloudSyncTransport } from '@/app/sync/cloudSync'
import { iCloudSync } from '@/app/sync/iCloudSync'
import { useCloudSyncPhotoUsage } from '@/lib/syncTransport/server/photoUsage'
import {
  contactPhotoFilename,
  filenameForNoteImage,
  profilePhotoFilename,
} from '@/lib/syncTransport/imageNames'
import { syncNow, syncTimestamp } from '@/lib/syncClock'
import useContacts from '@/stores/contactsStore'
import useConversations from '@/stores/conversationStore'
import useMileage from '@/stores/mileage'
import { referencedNoteImageIds } from '@/stores/noteImages'
import { useProfile } from '@/stores/profile'
import useServiceReport from '@/stores/serviceReport'
import {
  categorizePhotoFiles,
  withoutNotePhotos,
  type PhotoStorageBreakdown,
  type PhotoStorageReferences,
} from '@/app/sync/photoStorageModel'

export {
  PHOTO_STORAGE_CATEGORIES,
  type PhotoStorageBreakdown,
  type PhotoStorageCategory,
  type PhotoStorageTotals,
} from '@/app/sync/photoStorageModel'

export function currentPhotoStorageReferences(): PhotoStorageReferences {
  const { contacts, deletedContacts } = useContacts.getState()
  const contactFiles = new Set<string>()
  for (const contact of contacts) {
    const filename = contactPhotoFilename(contact.id, contact.avatar)
    if (filename) contactFiles.add(filename)
  }
  const recentlyDeleted = new Map<string, string>()
  for (const contact of deletedContacts) {
    if (contact.redacted) continue
    const filename = contactPhotoFilename(contact.id, contact.avatar)
    if (filename) recentlyDeleted.set(filename, contact.id)
  }
  const profile = profilePhotoFilename(useProfile.getState().avatar)
  return {
    contacts: contactFiles,
    profile: new Set(profile ? [profile] : []),
    notes: new Set([...referencedNoteImageIds()].map(filenameForNoteImage)),
    recentlyDeleted,
  }
}

export async function loadPhotoStorageBreakdown(): Promise<PhotoStorageBreakdown> {
  const files = await cloudSyncTransport.listBinaryFiles()
  return categorizePhotoFiles({
    files,
    references: currentPhotoStorageReferences(),
    usage: useCloudSyncPhotoUsage.getState().usage,
    now: syncNow(),
  })
}

const NO_AVATAR = { type: 'none', value: '' } as const

export function removePhotosFromRecords(): void {
  useContacts.setState(({ contacts }) => ({
    contacts: contacts.map((contact) =>
      contact.avatar?.type === 'image'
        ? {
            ...contact,
            avatar: NO_AVATAR,
            avatarMeta: undefined,
            updatedAt: syncTimestamp(contact.updatedAt),
          }
        : contact
    ),
  }))
  if (useProfile.getState().avatar?.type === 'image')
    useProfile.getState().setAvatar(NO_AVATAR)

  const conversations = useConversations.getState()
  for (const visit of conversations.conversations) {
    const stripped = withoutNotePhotos(visit)
    if (stripped)
      conversations.updateConversation({ id: visit.id, ...stripped })
  }

  const reports = useServiceReport.getState()
  for (const months of Object.values(reports.serviceReports))
    for (const entries of Object.values(months))
      for (const entry of entries) {
        const stripped = withoutNotePhotos(entry)
        if (stripped) reports.updateServiceReport({ ...entry, ...stripped })
      }
  for (const plan of reports.dayPlans) {
    const stripped = withoutNotePhotos(plan)
    if (stripped) reports.updateDayPlan({ id: plan.id, ...stripped })
  }
  for (const plan of reports.recurringPlans) {
    const stripped = withoutNotePhotos(plan)
    const overrides = plan.overrides?.map((override) => {
      const next = withoutNotePhotos(override)
      return next ? { ...override, ...next } : override
    })
    const overridesChanged = overrides?.some(
      (override, index) => override !== plan.overrides?.[index]
    )
    if (stripped || overridesChanged)
      reports.updateRecurringPlan({
        id: plan.id,
        ...stripped,
        ...(overridesChanged ? { overrides } : {}),
      })
  }

  const mileage = useMileage.getState()
  for (const trip of mileage.trips) {
    const stripped = withoutNotePhotos(trip)
    if (stripped) mileage.saveTrip({ ...trip, ...stripped })
  }
}

async function publishThenDelete(filenames: string[]): Promise<number> {
  if (!(await iCloudSync.push('photo-storage'))) return 0
  return iCloudSync.deleteCloudPhotosNotInUse(filenames)
}

export async function removeUnusedPhotos(): Promise<number> {
  await iCloudSync.pullAndMerge('photo-storage')
  const breakdown = await loadPhotoStorageBreakdown()
  return iCloudSync.deleteCloudPhotosNotInUse(breakdown.unusedFiles)
}

export async function emptyRecentlyDeletedPhotos(
  breakdown: PhotoStorageBreakdown
): Promise<number> {
  const filenames = [...currentPhotoStorageReferences().recentlyDeleted.keys()]
  const { removeDeletedContact } = useContacts.getState()
  for (const id of breakdown.recentlyDeletedContactIds) removeDeletedContact(id)
  return publishThenDelete(filenames)
}

export async function deleteAllPhotos(
  breakdown: PhotoStorageBreakdown
): Promise<number> {
  const { deletedContacts, removeDeletedContact } = useContacts.getState()
  for (const contact of deletedContacts)
    if (contact.avatar?.type === 'image') removeDeletedContact(contact.id)
  removePhotosFromRecords()
  return publishThenDelete(breakdown.files)
}
