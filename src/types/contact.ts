import { ProfileAvatar } from '@/types/avatar'

export type Address = {
  line1?: string
  line2?: string
  city?: string
  state?: string
  zip?: string
  country?: string
}

export type Coordinate = {
  latitude: number
  longitude: number
}

export type Contact = {
  id: string
  name: string
  phone?: string

  /**
   * If the phone number is on national form, this region code specifies the
   * region of the phone number, e.g. "SE" for Sweden.
   */
  phoneRegionCode?: string
  email?: string
  gender?: 'male' | 'female' | 'unknown'
  address?: Address

  /**
   * Used primarily for map markers.
   *
   * This may not always accurate as it uses a user input address as the search
   * query to determine coordinate.
   *
   * Coordinate is fetched as geocode from address from Here api:
   * https://www.here.com/docs/bundle/geocoding-and-search-api-v7-api-reference/page/index.html#/paths/~1geocode/get
   */
  coordinate?: Coordinate
  /**
   * The user manually updated the coordinate by dragging it. This should cause
   * the coordinate to take precedent over the address.
   */
  userDraggedCoordinate?: boolean
  createdAt: Date
  /**
   * Epoch ms of the most recent field change on this record. Populated by store
   * actions so the iCloud merge algorithm can pick the newest version when the
   * same id exists on multiple devices. Optional for historical records that
   * predate sync — backfilled lazily.
   */
  updatedAt?: number
  /**
   * Per-contact custom field values. Keyed by `CustomFieldDefinition.id`
   * (UUID), not by the user-facing label — so renaming a field on the def
   * doesn't orphan the value here. Definitions live in `contactsStore`'s
   * `customFieldDefs` and the renderer joins the two by id.
   */
  customFields?: Record<string, string>

  /**
   * When set, this contact is dismissed and should be hidden from the main
   * contact list and map until the dismissedUntil date has passed.
   */
  dismissedUntil?: Date

  /**
   * Notification ID for the scheduled notification to remind the user when the
   * contact becomes available again after being dismissed.
   */
  dismissedNotificationId?: string

  /**
   * When true, this contact is favorited and pinned to the top of contact lists
   * (home screen, contacts widget) above bible studies and any selected sort
   * order.
   */
  isFavorite?: boolean

  /**
   * Per-contact avatar — emoji, local image URI, or (when iCloud image sync is
   * enabled) an `icloud://contact-<id>` marker. Same shape as the user's
   * profile avatar so it renders through the shared `Avatar` component. See
   * `types/avatar.ts` for the full marker-vs-URI behavior matrix.
   *
   * Local image files live in `FileSystem.documentDirectory` under
   * `contact-<id>-avatar.jpg`. With image sync on, a deterministic twin exists
   * in the iCloud ubiquity container as `witness-work-img-contact-<id>.jpg` —
   * see `docs/icloud-image-sync-plan.md` for the full lifecycle.
   */
  avatar?: ProfileAvatar

  /**
   * Per-contact override for the avatar circle background (emoji + initial
   * fallback). Hex string when set, `null` when the user explicitly picked
   * "match accent", `undefined` when never touched. Both null and undefined
   * fall back to the theme's accentBackground at render time.
   */
  avatarBackground?: string | null

  /**
   * Per-contact override for the Contact Details hero / header background.
   * Independent of `avatarBackground` — the user can tint the screen chrome
   * without touching the avatar disc, and vice-versa. Same null/undefined
   * semantics: both fall back to the theme's accentBackground (which already
   * tracks a supporter's `customAccentColor`).
   */
  heroBackground?: string | null

  /**
   * Metadata about the contact's image avatar. Populated when the user picks an
   * image; absent for emoji / none / legacy image avatars. Used by the
   * full-screen image viewer's "i" popover.
   *
   * - `width` / `height` — pixel size of the original (uncropped) image.
   * - `fileSize` — bytes of the original image as picked.
   * - `capturedAt` — ISO-8601 string. Set from EXIF where available, otherwise
   *   the moment the photo was added to the contact.
   * - `croppedAt` — ISO-8601 timestamp of the most recent crop pass.
   *
   * Local-only — never travels through iCloud sync. Receivers compute their own
   * metadata after the binary lands (or, more pragmatically, just see no
   * metadata in the popover until they re-pick).
   */
  avatarMeta?: {
    width: number
    height: number
    fileSize?: number
    capturedAt?: string
    croppedAt?: string
  }
}
