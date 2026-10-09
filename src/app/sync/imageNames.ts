/**
 * Two parallel namespaces used by iCloud image sync (Phase 2):
 *
 * 1. **Container filenames** (`witness-work-img-*.jpg`) — what the binary actually
 *    lives under inside the iCloud ubiquity container. Deterministic per
 *    identity (contact id, or the singleton profile), so every device converges
 *    on the same filename for the same image and pushes are last-writer-wins at
 *    the filesystem level. See `docs/icloud-image-sync-plan.md` → "Filename
 *    namespace".
 * 2. **Marker values** (`icloud://contact-<id>` / `icloud://profile`) — what the
 *    `avatar.value` field holds inside the synced JSON payload when image sync
 *    is enabled on the sender. The payload carries no useful URI in this field;
 *    the marker is just a signal to the receiver ("this avatar is an image — go
 *    look for the binary"). The receiver computes the container filename from
 *    the contact id on its own (filename is fully derivable) and, after
 *    downloading, rewrites `avatar.value` to a local `file://` URI with a
 *    cache-buster. See Q2 decision in the design doc.
 *
 * Keeping these two spaces distinct (and both derivable from the identity) is
 * what lets us avoid stuffing filesystem paths into the synced JSON and avoid
 * stuffing protocol URIs into the filesystem.
 *
 * NOTE: filenames live at the top of the ubiquity container's `Documents/` dir
 * alongside the per-device JSON files — there is no subdirectory. The validator
 * is the hardened boundary at the Swift bridge that rejects any filename the
 * rest of the stack could ever try to pass through.
 */

const IMG_PREFIX = 'witness-work-img-'
/**
 * Photos in notes. A prefix of their own: builds from before note photos only
 * accept `witness-work-img-`, so they never list, adopt, or clean these up.
 */
const NOTE_IMG_PREFIX = 'witness-work-note-'
const IMG_EXT = '.jpg'
const CONTACT_FILENAME_PREFIX = `${IMG_PREFIX}contact-`
const PROFILE_FILENAME = `${IMG_PREFIX}profile.jpg`

const CONTACT_MARKER_PREFIX = 'icloud://contact-'

/**
 * Marker value that replaces the profile avatar's local `file://` URI in the
 * synced payload when `iCloudSyncIncludeImages` is on. Receivers detect this
 * constant and look up `filenameForProfile()` in the container.
 */
export const MARKER_PROFILE = 'icloud://profile'

/**
 * Container filename for a contact's avatar. Same contact id → same filename on
 * every device, which is what makes LWW-at-the-filesystem work.
 */
export function filenameForContact(id: string, revision?: string): string {
  return `${CONTACT_FILENAME_PREFIX}${id}${revision ? `--${revision}` : ''}${IMG_EXT}`
}

/**
 * Container filename for the user's profile avatar. No id embedded — a single
 * Apple ID has a single profile, and "last writer wins" on the filename is the
 * intended semantics (see Q8).
 */
export function filenameForProfile(revision?: string): string {
  return revision
    ? `${IMG_PREFIX}profile--${revision}${IMG_EXT}`
    : PROFILE_FILENAME
}

/**
 * Encoded marker for a contact's avatar value in the synced JSON payload.
 * Round-trips with `parseContactMarker`.
 */
export function markerForContact(id: string): string {
  return `${CONTACT_MARKER_PREFIX}${id}`
}

/**
 * Extracts the contact id from a marker produced by `markerForContact`. Returns
 * null for the profile marker, for local `file://` URIs, and for any
 * unrecognised string — callers rely on `null` to short-circuit the image sync
 * lookup on the receive path.
 */
export function parseContactMarker(value: string): string | null {
  if (!value.startsWith(CONTACT_MARKER_PREFIX)) return null
  const id = value.slice(CONTACT_MARKER_PREFIX.length)
  if (id.length === 0) return null
  return id
}

/**
 * Container filename for a note photo. Photos are immutable (editing one makes
 * a new id), so one name per id is uploaded once and never rewritten.
 */
export function filenameForNoteImage(id: string): string {
  return `${NOTE_IMG_PREFIX}${id}${IMG_EXT}`
}

/** The photo id in a note photo's container filename, or null. */
export function noteImageIdFromFilename(name: string): string | null {
  if (!name.startsWith(NOTE_IMG_PREFIX) || !name.endsWith(IMG_EXT)) return null
  const id = name.slice(NOTE_IMG_PREFIX.length, -IMG_EXT.length)
  return /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : null
}

/** Narrow check for the profile marker constant. */
export function isProfileMarker(value: string): boolean {
  return value === MARKER_PROFILE
}

/**
 * Shared by the Swift bridge (as `isValidImageFilename`) and the JS
 * orchestration code. Keep the rule tight — any filename the TS layer would
 * refuse is also refused natively, and vice versa.
 *
 * Rejects:
 *
 * - Anything outside the `witness-work-img-` (avatars) and `witness-work-note-`
 *   (note photos) prefixes / `.jpg` suffix
 * - Path separators and `..` components (defence-in-depth against a contact id
 *   ever containing filesystem-traversal bytes)
 * - Empty-middle filenames like `witness-work-img-.jpg`
 */
export function isValidImageFilename(name: string): boolean {
  const prefix = name.startsWith(IMG_PREFIX)
    ? IMG_PREFIX
    : name.startsWith(NOTE_IMG_PREFIX)
      ? NOTE_IMG_PREFIX
      : null
  if (!prefix) return false
  if (!name.endsWith(IMG_EXT)) return false
  if (name.includes('/')) return false
  if (name.includes('..')) return false
  const middle = name.slice(prefix.length, name.length - IMG_EXT.length)
  if (middle.length === 0) return false
  return true
}

/** An avatar (contact or profile) photo, as opposed to a note photo. */
export function isAvatarImageFilename(name: string): boolean {
  return name.startsWith(IMG_PREFIX) && isValidImageFilename(name)
}
