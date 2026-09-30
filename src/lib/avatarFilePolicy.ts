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
