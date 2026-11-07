import semver from 'semver'
import apis from '@/constants/apis'
import {
  accountSessions,
  checkInstall,
  isThisDeviceSession,
} from '@/lib/serverAccount'
import {
  type AccountDevice,
  type ActivityClientOptions,
  fetchAccountDevices,
} from '@/lib/serverAccount/activityClient'

export const activityOptions =
  (accountKey: Uint8Array, signal?: AbortSignal) =>
  (renew = false): ActivityClientOptions => ({
    baseUrl: apis.accounts,
    request: (request) =>
      accountSessions.request(request, { accountKey, renew }),
    signal,
  })

export async function readAccountDevices(
  accountKey: Uint8Array,
  signal?: AbortSignal
): Promise<AccountDevice[]> {
  const options = activityOptions(accountKey, signal)
  const devices = await fetchAccountDevices(options())
  if (devices.some((device) => device.current)) return devices
  return fetchAccountDevices(options(true))
}

export async function signedInElsewhere(
  accountKey: Uint8Array,
  signal?: AbortSignal
): Promise<boolean> {
  await checkInstall()
  const devices = await readAccountDevices(accountKey, signal)
  return devices.some(
    (device) => !device.current && !isThisDeviceSession(device.sessionId)
  )
}

export const KEY_CHANGE_MIN_APP_VERSION = '1.47.0'

export async function devicesTooOldForKeyChange(
  accountKey: Uint8Array,
  signal?: AbortSignal
): Promise<AccountDevice[]> {
  const devices = await readAccountDevices(accountKey, signal)
  return devices.filter(isTooOldForKeyChange)
}

export function isTooOldForKeyChange(device: AccountDevice): boolean {
  if (device.current) return false
  const version = semver.valid(device.appVersion)
  return !version || semver.lt(version, KEY_CHANGE_MIN_APP_VERSION)
}
