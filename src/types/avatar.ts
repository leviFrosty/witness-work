/**
 * User-selected profile avatar.
 *
 * - `none`: no avatar set (display falls back to initial letter or icon)
 * - `emoji`: `value` holds the emoji character
 * - `image`: `value` holds a local file URI inside `FileSystem.documentDirectory`
 *   — image never leaves the device.
 */
export type ProfileAvatar = {
  type: 'none' | 'emoji' | 'image'
  value: string
}
