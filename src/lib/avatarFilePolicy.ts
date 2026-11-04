/**
 * A `data:` or `blob:` URL, which holds its own bytes instead of naming a file.
 * URL schemes are case-insensitive.
 */
export const isInlineImage = (uri: string): boolean =>
  /^(data|blob):/i.test(uri)

/**
 * Whether an avatar `value` is a photo this device holds itself: a file a phone
 * saved, or a browser's inline image. A synced payload carries only a marker in
 * its place, so a merge keeps this value when the winning copy is the same
 * photo (same revision).
 */
export const isLocalAvatarValue = (value: string | undefined): boolean =>
  value !== undefined && (value.startsWith('file://') || isInlineImage(value))

type AvatarLike = { type?: string; value?: string; revision?: string }

/**
 * Whether a merge keeps this device's avatar when another device's newer copy
 * of the record wins:
 *
 * - Same photo (same revision): the payload carries a marker in place of the
 *   photo this device holds (`isLocalAvatarValue`), so keep the local value.
 * - A browser's own photo (`data:` / `blob:`) against a copy with no photo: the
 *   web sends no photo for one (`sanitizeContactAvatar`), so no other device
 *   ever had it to remove, and its "none" means only that it never had it.
 */
export function keepsLocalAvatar(
  local: AvatarLike | undefined,
  remote: AvatarLike | undefined
): boolean {
  if (local?.type !== 'image') return false
  if (remote?.type === 'image')
    return local.revision === remote.revision && isLocalAvatarValue(local.value)
  return (
    (remote === undefined || remote.type === 'none') &&
    local.value !== undefined &&
    isInlineImage(local.value)
  )
}

/** Restrict photo IO to managed filenames, including decoded URI traversal. */
export function isManagedAvatarPath(
  uri: string,
  documentDirectory: string
): boolean {
  try {
    const path = decodeURIComponent(uri.split('?')[0])
    const directory = decodeURIComponent(documentDirectory)
    const root = directory.endsWith('/') ? directory : `${directory}/`
    if (!path.startsWith(root)) return false
    const filename = path.slice(root.length)
    if (
      filename.includes('/') ||
      filename.includes('\\') ||
      filename.includes('%')
    )
      return false
    return /^(?:contact-.+-avatar|profile-avatar)(?:-original(?:-[a-zA-Z0-9_-]+)?|-(?:picked|synced)(?:-[a-zA-Z0-9_-]+)?)?\.jpg$/.test(
      filename
    )
  } catch {
    return false
  }
}

/** Parse the entire managed filename; prefix matching confuses contact IDs. */
export function avatarFileContactId(filename: string): string | undefined {
  if (/[\\/%]/.test(filename)) return undefined
  return /^contact-(.+)-avatar(?:-original(?:-[a-zA-Z0-9_-]+)?|-(?:picked|synced)(?:-[a-zA-Z0-9_-]+)?)?\.jpg$/.exec(
    filename
  )?.[1]
}

export function originalSiblingFileName(
  croppedFileName: string,
  revision?: string
): string {
  const dotIdx = croppedFileName.lastIndexOf('.')
  const suffix = revision ? `-original-${revision}` : '-original'
  if (dotIdx === -1) return `${croppedFileName}${suffix}`
  return `${croppedFileName.slice(0, dotIdx)}${suffix}${croppedFileName.slice(dotIdx)}`
}
