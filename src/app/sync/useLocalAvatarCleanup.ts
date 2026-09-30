import { useEffect } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import useContacts from '@/stores/contactsStore'
import { useProfile } from '@/stores/profile'
import { errorTracking } from '@/lib/errorTracking'
import {
  avatarFileContactId,
  isManagedAvatarPath,
  originalSiblingFileName,
} from '@/lib/avatarFilePolicy'
import type { ProfileAvatar } from '@/types/avatar'
import type { Contact } from '@/types/contact'

const pathWithoutQuery = (uri: string) => uri.split('?')[0]

const ownedContacts = (state: {
  contacts: Contact[]
  deletedContacts: Contact[]
}) => [
  ...state.contacts,
  ...state.deletedContacts.filter((contact) => !contact.redacted),
]

const originalPath = (filename: string, avatar: ProfileAvatar) =>
  `${FileSystem.documentDirectory}${originalSiblingFileName(filename, avatar.revision)}`

const contactPaths = (contact: Contact) =>
  contact.avatar?.type === 'image'
    ? [
        pathWithoutQuery(contact.avatar.value),
        originalPath(`contact-${contact.id}-avatar.jpg`, contact.avatar),
      ]
    : []

/** Remove local photo bytes when a deletion/removal arrives, on either platform. */
export function useLocalAvatarCleanup(ready: boolean | undefined) {
  useEffect(() => {
    if (!ready || !FileSystem.documentDirectory) return
    const remove = async (paths: string[]) => {
      for (const path of paths) {
        const current = new Set(
          [
            ...ownedContacts(useContacts.getState()).flatMap(contactPaths),
            useProfile.getState().avatar.value,
            ...(useProfile.getState().avatar.type === 'image'
              ? [
                  originalPath(
                    'profile-avatar.jpg',
                    useProfile.getState().avatar
                  ),
                ]
              : []),
          ].map(pathWithoutQuery)
        )
        if (
          !isManagedAvatarPath(path, FileSystem.documentDirectory!) ||
          current.has(path)
        )
          continue
        try {
          await FileSystem.deleteAsync(path, { idempotent: true })
        } catch (error) {
          errorTracking.captureException(error, { localAvatars: 'remove' })
        }
      }
    }
    const scanErasedOwners = async (ids: Set<string>) => {
      if (ids.size === 0) return
      try {
        const files = await FileSystem.readDirectoryAsync(
          FileSystem.documentDirectory!
        )
        await remove(
          files
            .filter((file) => {
              const owner = avatarFileContactId(file)
              return !!owner && ids.has(owner)
            })
            .map((file) => `${FileSystem.documentDirectory}${file}`)
        )
      } catch (error) {
        errorTracking.captureException(error, { localAvatars: 'scan' })
      }
    }
    const contacts = useContacts.subscribe((state, previous) => {
      if (
        state.contacts === previous.contacts &&
        state.deletedContacts === previous.deletedContacts
      )
        return
      const before = ownedContacts(previous)
      const after = ownedContacts(state)
      const removed = before.filter(
        (contact) =>
          !after.some(
            (next) =>
              next.id === contact.id &&
              pathWithoutQuery(next.avatar?.value ?? '') ===
                pathWithoutQuery(contact.avatar?.value ?? '')
          )
      )
      void remove(removed.flatMap(contactPaths))
      // Redaction/permanent removal also erases abandoned drafts for that owner.
      void scanErasedOwners(
        new Set(
          before
            .filter((contact) => !after.some((next) => next.id === contact.id))
            .map((contact) => contact.id)
        )
      )
    })
    const profile = useProfile.subscribe((state, previous) => {
      if (
        previous.avatar.type !== 'image' ||
        pathWithoutQuery(previous.avatar.value) ===
          pathWithoutQuery(state.avatar.value)
      )
        return
      void remove([
        pathWithoutQuery(previous.avatar.value),
        originalPath('profile-avatar.jpg', previous.avatar),
      ])
    })
    // Recoverable archives keep their files for the same retention window.
    const current = useContacts.getState()
    void scanErasedOwners(
      new Set(
        current.deletedContacts
          .filter(
            (contact) =>
              contact.redacted &&
              !current.contacts.some((active) => active.id === contact.id)
          )
          .map((contact) => contact.id)
      )
    )
    return () => {
      contacts()
      profile()
    }
  }, [ready])
}
