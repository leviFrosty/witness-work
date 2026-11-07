const VERSION = /^(\d{1,3})\.(\d{1,3})(?:\.(\d{1,3}))?$/

export function encodeVersion(version: string): number | null {
  const match = VERSION.exec(version.trim())
  if (!match) return null
  const [major, minor, patch = '0'] = match.slice(1)
  return Number(major) * 1_000_000 + Number(minor) * 1_000 + Number(patch)
}
