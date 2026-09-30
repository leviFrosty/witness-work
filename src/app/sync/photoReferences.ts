import type { SyncPayload } from '@/app/sync/payload'

export function payloadReferencesPhotos(remote: SyncPayload): boolean {
  const avatars = [
    remote.profileStore?.values.avatar,
    remote.preferencesStore.values.avatar,
    ...remote.contactStore.contacts.map((contact) => contact.avatar),
  ]
  return avatars.some(
    (avatar) =>
      avatar?.type === 'image' &&
      typeof avatar.value === 'string' &&
      avatar.value.startsWith('icloud://')
  )
}
