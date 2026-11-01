import apis from '@/constants/apis'
import { accountSessions, isThisDeviceSession } from '@/lib/serverAccount'
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
  const devices = await readAccountDevices(accountKey, signal)
  return devices.some(
    (device) => !device.current && !isThisDeviceSession(device.sessionId)
  )
}
