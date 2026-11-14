import { sha256Bytes } from '../crypto'

const encoder = new TextEncoder()

/** The App Attest "relying party" id: `<TeamID>.<BundleID>`. */
export const appAttestAppId = (teamId: string, bundleId: string): string =>
  `${teamId}.${bundleId}`

/**
 * Bundle ids whose App Attest keys this Worker accepts, primary first.
 * `IOS_BUNDLE_ID` is the primary (and the bound id for keys stored before
 * bundle binding existed); `IOS_ADDITIONAL_BUNDLE_IDS` is an optional
 * comma-separated list (e.g. the internal TestFlight beta app).
 */
export const acceptedBundleIds = (environment: {
  IOS_BUNDLE_ID: string
  IOS_ADDITIONAL_BUNDLE_IDS?: string
}): readonly string[] => {
  const primary = environment.IOS_BUNDLE_ID?.trim()
  if (!primary) throw new Error('IOS_BUNDLE_ID must be configured')
  const additional = (environment.IOS_ADDITIONAL_BUNDLE_IDS ?? '')
    .split(',')
    .map((bundleId) => bundleId.trim())
    .filter(Boolean)
  return [...new Set([primary, ...additional])]
}

/** SHA-256 of the app id — the value authenticatorData's first 32 bytes must equal. */
export const appIdRpHash = async (
  teamId: string,
  bundleId: string
): Promise<Uint8Array> =>
  sha256Bytes(encoder.encode(appAttestAppId(teamId, bundleId)))

/** Byte-wise equality. */
export const bytesEqual = (a: Uint8Array, b: Uint8Array): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}
