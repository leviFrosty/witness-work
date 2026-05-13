import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { AvatarSource, DownloadedAvatar } from '@/app/sync/imageSync'
import { parseContactMarker, isProfileMarker } from '@/app/sync/imageNames'

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
 * Defense-in-depth: ensure an avatar source path lives inside the app's own
 * document directory before it reaches the iCloud-write pipeline. The
 * contactImport validator already strips image avatars off any imported payload
 * — this is the second layer that would catch a future regression which
 * re-opens that door. A foreign `file://` path could otherwise point at MMKV /
 * AsyncStorage / Sentry breadcrumbs / the ubiquity container itself, and the
 * bridge would happily copy that file into iCloud Drive as a JPEG.
 *
 * Both inputs are normalized to plain `/path` strings (scheme stripped,
 * traversal segments rejected) and compared by prefix. The cache-buster has
 * already been removed upstream.
 */
function isInsideDocumentDirectory(
  candidate: string,
  documentDirectory: string
): boolean {
  const normalize = (input: string): string | null => {
    if (!input) return null
    const stripped = input.startsWith('file://')
      ? input.slice('file://'.length)
      : input
    if (stripped.split('/').some((seg) => seg === '..')) return null
    return stripped
  }
  const c = normalize(candidate)
  const d = normalize(documentDirectory)
  if (c == null || d == null) return false
  const dirPrefix = d.endsWith('/') ? d : `${d}/`
  return c.startsWith(dirPrefix)
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
  documentDirectory: string
}): AvatarSource[] {
  const sources: AvatarSource[] = []

  for (const c of args.contacts) {
    if (c.avatar?.type !== 'image') continue
    if (!c.avatar.value.startsWith('file://')) continue
    const localPath = stripCacheBuster(c.avatar.value)
    if (!isInsideDocumentDirectory(localPath, args.documentDirectory)) continue
    sources.push({ kind: 'contact', id: c.id, localPath })
  }

  const profile = args.profileAvatar
  if (profile?.type === 'image' && profile.value.startsWith('file://')) {
    const localPath = stripCacheBuster(profile.value)
    if (isInsideDocumentDirectory(localPath, args.documentDirectory)) {
      sources.push({ kind: 'profile', localPath })
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
  documentDirectory: string
}): AvatarSource[] {
  const sources: AvatarSource[] = []

  for (const c of args.contacts) {
    if (c.avatar?.type !== 'image') continue
    const markerId = parseContactMarker(c.avatar.value)
    if (markerId == null) continue
    sources.push({
      kind: 'contact',
      id: c.id,
      localPath: localAvatarPathForContact(args.documentDirectory, c.id),
    })
  }

  const profile = args.profileAvatar
  if (profile?.type === 'image' && isProfileMarker(profile.value)) {
    sources.push({
      kind: 'profile',
      localPath: localAvatarPathForProfile(args.documentDirectory),
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
  downloaded: DownloadedAvatar[]
}): { contacts: Contact[]; profileAvatar: ProfileAvatar | undefined } {
  if (args.downloaded.length === 0) {
    return { contacts: args.contacts, profileAvatar: args.profileAvatar }
  }

  const contactUris = new Map<string, string>()
  let profileUri: string | undefined
  for (const d of args.downloaded) {
    if (d.kind === 'contact') contactUris.set(d.id, d.localUri)
    else profileUri = d.localUri
  }

  const nextContacts = contactUris.size
    ? args.contacts.map((c) => {
        const uri = contactUris.get(c.id)
        if (!uri) return c
        return { ...c, avatar: { type: 'image' as const, value: uri } }
      })
    : args.contacts

  const nextProfile =
    profileUri != null
      ? { type: 'image' as const, value: profileUri }
      : args.profileAvatar

  return { contacts: nextContacts, profileAvatar: nextProfile }
}
