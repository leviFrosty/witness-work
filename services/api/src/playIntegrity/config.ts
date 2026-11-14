import type { Environment } from '../types'

export type RequiredDeviceVerdict =
  | 'MEETS_BASIC_INTEGRITY'
  | 'MEETS_DEVICE_INTEGRITY'
  | 'MEETS_STRONG_INTEGRITY'

export interface PlayIntegrityConfig {
  packageName: string
  /** Not secret: the app needs it to prepare standard integrity requests. */
  cloudProjectNumber: string
  serviceAccountJson: string
  /** Empty means any certificate Play recognizes for the package. */
  certificateDigests: readonly string[]
  requiredDeviceVerdict: RequiredDeviceVerdict
}

export type PlayIntegrityEnv = Pick<
  Environment,
  | 'ANDROID_PACKAGE_NAME'
  | 'PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER'
  | 'PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON'
  | 'ANDROID_CERT_SHA256_DIGESTS'
  | 'PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT'
>

const REQUIRED_DEVICE_VERDICTS = new Set<RequiredDeviceVerdict>([
  'MEETS_BASIC_INTEGRITY',
  'MEETS_DEVICE_INTEGRITY',
  'MEETS_STRONG_INTEGRITY',
])

/**
 * Android Notes Import is available only when every required value is set.
 * A partial configuration returns null, so the status endpoint does not
 * advertise Play Integrity and Android keeps its entry points hidden.
 */
export const playIntegrityConfig = (
  env: PlayIntegrityEnv
): PlayIntegrityConfig | null => {
  const packageName = env.ANDROID_PACKAGE_NAME?.trim()
  const cloudProjectNumber = env.PLAY_INTEGRITY_CLOUD_PROJECT_NUMBER?.trim()
  const serviceAccountJson = env.PLAY_INTEGRITY_SERVICE_ACCOUNT_JSON?.trim()
  if (
    !packageName ||
    !cloudProjectNumber ||
    !/^\d{1,20}$/.test(cloudProjectNumber) ||
    !serviceAccountJson
  ) {
    return null
  }
  const requested = env.PLAY_INTEGRITY_REQUIRED_DEVICE_VERDICT?.trim()
  const requiredDeviceVerdict =
    requested && REQUIRED_DEVICE_VERDICTS.has(requested as RequiredDeviceVerdict)
      ? (requested as RequiredDeviceVerdict)
      : 'MEETS_DEVICE_INTEGRITY'
  return {
    packageName,
    cloudProjectNumber,
    serviceAccountJson,
    certificateDigests: (env.ANDROID_CERT_SHA256_DIGESTS ?? '')
      .split(',')
      .map((digest) => digest.trim())
      .filter(Boolean),
    requiredDeviceVerdict,
  }
}
