import { Contact } from '@/types/contact'
import { ProfileAvatar } from '@/types/avatar'
import { markerForContact, MARKER_PROFILE } from '@/app/sync/imageNames'

/**
 * Sanitizes a contact's avatar for inclusion in the synced iCloud JSON payload.
 * Two modes, switched on the device's `iCloudSyncIncludeImages` preference:
 *
 * - **`includeImages: false`** (Phase 1 default): drop image avatars from the
 *   payload entirely. The `file://` URI stored in `avatar.value` is a path
 *   inside THIS device's `FileSystem.documentDirectory` and would be a dead
 *   path on every other device, so it must not cross the wire. Emoji + none
 *   avatars are safe to sync as-is.
 * - **`includeImages: true`**: rewrite `avatar.value` from the local `file://...`
 *   URI to a stable marker (`icloud://contact-<id>`). The receiver decodes the
 *   marker, looks up the corresponding binary file in the iCloud container,
 *   downloads it, and then rewrites `avatar.value` locally to its own `file://`
 *   path. The payload JSON never carries filesystem paths and never carries
 *   image bytes — see Q2 / Q3 / Q4 in the design doc for the rationale.
 *
 * This function is intentionally pure so the `vitest` suite can exercise it
 * without faking out the zustand stores that the rest of `buildPayload` depends
 * on.
 */
export function sanitizeContactAvatar(
  contact: Contact,
  opts: { includeImages: boolean }
): Contact {
  if (contact.avatar?.type !== 'image') return contact
  if (!opts.includeImages) {
    const rest: Contact = { ...contact }
    delete rest.avatar
    return rest
  }
  return {
    ...contact,
    avatar: { type: 'image', value: markerForContact(contact.id) },
  }
}

/**
 * Twin of `sanitizeContactAvatar` for the user's single profile avatar.
 *
 * - **`includeImages: false`**: collapse an image avatar to `{ type: 'none' }`.
 *   Other types pass through — the `avatar` preference is a concrete value, not
 *   optional, so we can't just delete it.
 * - **`includeImages: true`**: rewrite `avatar.value` to the profile marker.
 *   There is no per-user identity — a single Apple ID has a single profile, and
 *   the binary is at `witness-work-img-profile.jpg` regardless of which device
 *   wrote it (Q8).
 */
export function sanitizeProfileAvatar(
  avatar: ProfileAvatar | undefined,
  opts: { includeImages: boolean }
): ProfileAvatar | undefined {
  if (!avatar) return avatar
  if (avatar.type !== 'image') return avatar
  if (!opts.includeImages) return { type: 'none', value: '' }
  return { type: 'image', value: MARKER_PROFILE }
}
