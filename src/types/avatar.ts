/**
 * User-selected profile avatar. Same shape used for per-contact avatars (see
 * `Contact.avatar`) so everything renders through the shared `Avatar`
 * component.
 *
 * `type` encodes the avatar's _intent_; `value` holds the representation
 * tailored to that type.
 *
 * - `none`: no avatar set. `value` is `''`. Display falls back to the user's
 *   initial or a generic person icon.
 * - `emoji`: `value` holds the emoji character (e.g. `'🌱'`). Background colour
 *   is supplied by the preference layer / theme.
 * - `image`: `value` is one of:
 *
 *   1. A **local `file://` URI** inside `FileSystem.documentDirectory` (e.g.
 *        `file:///.../contact-<id>-avatar.jpg?t=<ts>`). This is the normal
 *        at-rest state on the device that owns the image. The `?t=<ts>`
 *        cache-buster is intentional — `<Image>` caches by URI, so writing the
 *        same path over and over needs a changing query string to force a
 *        reload.
 *   2. An **`icloud://` marker** (e.g. `icloud://contact-<id>` or
 *        `icloud://profile`). A marker appears in `avatar.value` on a record
 *        that was just pulled from iCloud and whose binary has not yet been
 *        downloaded to this device. It's a placeholder — not a renderable URI.
 *        The `Avatar` component detects markers and renders the initials
 *        fallback until the binary lands and the sync layer overwrites the
 *        marker with a real `file://` URI. Markers can also _persist
 *        indefinitely_ when the sender turned image sync off or when this
 *        device has image sync off; in both cases the fallback render is the
 *        permanent outcome, which is correct per the design doc's Q3 / Q4
 *        discussion.
 *
 *   Markers never leave a receiving device (the sync layer rewrites them on
 *   download) except for this one case: if image sync is disabled on this
 *   device, the marker stays in the record for the full session. The record is
 *   still valid data — it just says "image intended, binary unavailable here."
 *
 *   Consumers that need to decide "do I have a real image to show?" should use
 *   the `isRenderableImageValue` helper in `components/Avatar.tsx` or check
 *   `value.startsWith('file://')` — not just `type === 'image'`.
 */
export type ProfileAvatar = {
  type: 'none' | 'emoji' | 'image'
  value: string
}
