import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { AvatarSource, DownloadedAvatar } from '@/app/sync/imageSync'
import { parseContactMarker, isProfileMarker } from '@/app/sync/imageNames'
import { isManagedAvatarPath } from '@/lib/avatarFilePolicy'

/**
 * Conventional local filename for a contact's avatar image inside
 * `FileSystem.documentDirectory`. Mirrors the filename constructed by
 * `AvatarPickerContent` when the user picks an image for a contact — keeping
 * the two in lockstep is what lets the pull path infer the local target path
 * without negotiating over the wire.
 */
export function localAvatarPathForContact(
  documentDirectory: string,
  id: string
): string {
  return `${documentDirectory}contact-${id}-avatar.jpg`
}

/**
 * Conventional local filename for the user's profile avatar. Also mirrors
 * `AvatarPickerContent`.
 */
export function localAvatarPathForProfile(documentDirectory: string): string {
  return `${documentDirectory}profile-avatar.jpg`
}

/**
 * Strips the cache-buster query string the avatar picker appends (`?t=<ts>`) so
 * the raw `file://` path can be handed to `writeBinary`, which wants a real
 * filesystem location.
 */
function stripCacheBuster(value: string): string {
  const q = value.indexOf('?')
  return q < 0 ? value : value.slice(0, q)
}

/**
 * Walks the local state and returns every avatar whose value is a local
 * `file://` URI — these are the ones the device has in
 * `FileSystem.documentDirectory` and needs to UPLOAD on the next push.
 *
 * Intentionally ignores avatars whose value is already an `icloud://` marker
 * (those came from a foreign device's push; this device doesn't own the bytes)
 * and non-image avatars (emoji/none — nothing to upload).
 */
export function collectLocalAvatarSources(args: {
  contacts: Contact[]
  profileAvatar: ProfileAvatar | undefined
  profileUpdatedAt?: number
  documentDirectory: string
}): AvatarSource[] {
  const sources: AvatarSource[] = []

  for (const c of args.contacts) {
    if (c.avatar?.type !== 'image') continue
    if (!c.avatar.value.startsWith('file://')) continue
    const localPath = stripCacheBuster(c.avatar.value)
    if (!isManagedAvatarPath(localPath, args.documentDirectory)) continue
    sources.push({
      kind: 'contact',
      id: c.id,
      localPath,
      ...(c.avatar.revision ? { revision: c.avatar.revision } : {}),
    })
  }

  const profile = args.profileAvatar
  if (profile?.type === 'image' && profile.value.startsWith('file://')) {
    const localPath = stripCacheBuster(profile.value)
    if (isManagedAvatarPath(localPath, args.documentDirectory)) {
      sources.push({
        kind: 'profile',
        localPath,
        ...(profile.revision ? { revision: profile.revision } : {}),
      })
    }
  }

  return sources
}

/**
 * Walks the local state and returns every avatar whose value is an `icloud://`
 * marker — these records arrived via pull-and-merge but the binary has never
 * been downloaded on this device. Paths are the expected
 * `FileSystem.documentDirectory` destinations the downloader will write to.
 */
export function collectExpectedMarkerSources(args: {
  contacts: Contact[]
  profileAvatar: ProfileAvatar | undefined
  profileUpdatedAt?: number
  documentDirectory: string
}): AvatarSource[] {
  const sources: AvatarSource[] = []

  for (const c of args.contacts) {
    if (c.avatar?.type !== 'image') continue
    if (
      c.avatar.value.startsWith('file://') &&
      !isManagedAvatarPath(
        stripCacheBuster(c.avatar.value),
        args.documentDirectory
      )
    )
      continue
    const markerId = parseContactMarker(c.avatar.value)
    if (markerId == null && !c.avatar.value.startsWith('file://')) continue
    sources.push({
      kind: 'contact',
      id: c.id,
      localPath: localAvatarPathForContact(
        args.documentDirectory,
        c.id
      ).replace(
        '.jpg',
        `-synced${c.avatar.revision ? `-${c.avatar.revision}` : ''}.jpg`
      ),
      fallbackPath: c.avatar.value.startsWith('file://')
        ? stripCacheBuster(c.avatar.value)
        : !c.avatar.revision
          ? localAvatarPathForContact(args.documentDirectory, c.id)
          : undefined,
      expectedValue: c.avatar.value,
      expectedUpdatedAt: c.updatedAt,
      ...(c.avatar.revision ? { revision: c.avatar.revision } : {}),
    })
  }

  const profile = args.profileAvatar
  if (
    profile?.type === 'image' &&
    (isProfileMarker(profile.value) ||
      (profile.value.startsWith('file://') &&
        isManagedAvatarPath(profile.value, args.documentDirectory)))
  ) {
    sources.push({
      kind: 'profile',
      localPath: localAvatarPathForProfile(args.documentDirectory).replace(
        '.jpg',
        `-synced${profile.revision ? `-${profile.revision}` : ''}.jpg`
      ),
      fallbackPath: profile.value.startsWith('file://')
        ? stripCacheBuster(profile.value)
        : !profile.revision
          ? localAvatarPathForProfile(args.documentDirectory)
          : undefined,
      expectedValue: profile.value,
      ...(args.profileUpdatedAt !== undefined
        ? { expectedUpdatedAt: args.profileUpdatedAt }
        : {}),
      ...(profile.revision ? { revision: profile.revision } : {}),
    })
  }

  return sources
}

/**
 * Takes the set of identities whose binaries just finished downloading and
 * returns new contact / profile values with their `avatar.value` rewritten to
 * the freshly-written local URI (with cache-buster included).
 *
 * **Does not bump `updatedAt`** on any rewritten record: the rewrite is a
 * display-layer fix-up, not a user edit. Bumping would cause the next push to
 * advertise the marker→file:// flip and trigger a no-op churn loop across
 * devices — see Q3 design notes.
 */
export function applyDownloadedAvatars(args: {
  contacts: Contact[]
  profileAvatar: ProfileAvatar | undefined
  profileUpdatedAt?: number
  downloaded: DownloadedAvatar[]
}): { contacts: Contact[]; profileAvatar: ProfileAvatar | undefined } {
  if (args.downloaded.length === 0) {
    return { contacts: args.contacts, profileAvatar: args.profileAvatar }
  }

  const contactUris = new Map<string, DownloadedAvatar & { kind: 'contact' }>()
  let downloadedProfile: (DownloadedAvatar & { kind: 'profile' }) | undefined
  for (const d of args.downloaded) {
    if (d.kind === 'contact') contactUris.set(d.id, d)
    else downloadedProfile = d
  }

  let contactsChanged = false
  const mappedContacts = contactUris.size
    ? args.contacts.map((c) => {
        const download = contactUris.get(c.id)
        if (
          !download ||
          (download.expectedUpdatedAt !== undefined &&
            c.updatedAt !== download.expectedUpdatedAt) ||
          (download.expectedValue !== undefined &&
            (c.avatar?.value !== download.expectedValue ||
              c.avatar.revision !== download.revision))
        )
          return c
        if (c.avatar?.value === download.localUri) return c
        contactsChanged = true
        return {
          ...c,
          avatar: {
            ...c.avatar,
            type: 'image' as const,
            value: download.localUri,
          },
        }
      })
    : args.contacts
  const nextContacts = contactsChanged ? mappedContacts : args.contacts

  const nextProfile =
    downloadedProfile != null &&
    downloadedProfile.localUri !== args.profileAvatar?.value &&
    (downloadedProfile.expectedUpdatedAt === undefined ||
      downloadedProfile.expectedUpdatedAt === args.profileUpdatedAt) &&
    (downloadedProfile.expectedValue === undefined ||
      (args.profileAvatar?.value === downloadedProfile.expectedValue &&
        args.profileAvatar.revision === downloadedProfile.revision))
      ? {
          ...args.profileAvatar,
          type: 'image' as const,
          value: downloadedProfile.localUri,
        }
      : args.profileAvatar

  return { contacts: nextContacts, profileAvatar: nextProfile }
}

/** Keep useful bytes for a still-current revision, even after a text edit. */
export function obsoleteDownloadPaths(args: {
  contacts: Contact[]
  deletedContacts?: Contact[]
  profileAvatar: ProfileAvatar | undefined
  downloaded: DownloadedAvatar[]
  documentDirectory: string
}): string[] {
  const contacts = [
    ...args.contacts,
    ...(args.deletedContacts ?? []).filter((contact) => !contact.redacted),
  ]
  const references = new Set(
    [
      ...contacts.map((contact) => contact.avatar?.value ?? ''),
      args.profileAvatar?.value ?? '',
    ].map(stripCacheBuster)
  )
  return [
    ...new Set(
      args.downloaded
        .filter((download) => {
          const current =
            download.kind === 'profile'
              ? args.profileAvatar
              : contacts.find((contact) => contact.id === download.id)?.avatar
          return !(
            current?.type === 'image' && current.revision === download.revision
          )
        })
        .map((download) => stripCacheBuster(download.localUri))
    ),
  ].filter(
    (path) =>
      isManagedAvatarPath(path, args.documentDirectory) &&
      !references.has(path) &&
      /-synced(?:-[a-zA-Z0-9_-]+)?\.jpg$/.test(path)
  )
}
