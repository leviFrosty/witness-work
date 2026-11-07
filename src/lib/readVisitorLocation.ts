import { Platform } from 'react-native'
import { readLaunchAppConfig } from '@/lib/appUpdate/launchConfig'
import { devCountryOverride } from '@/lib/launchAddress'
import {
  createVisitorLocation,
  type VisitorLocation,
} from '@/lib/visitorLocation'

const READ_TIMEOUT_MS = 5_000

const withTimeout = <T>(promise: Promise<T>): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([
    promise,
    new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), READ_TIMEOUT_MS)
    }),
  ]).finally(() => clearTimeout(timer))
}

const fetchConfigLocation = async (): Promise<VisitorLocation | null> =>
  (await withTimeout(readLaunchAppConfig())).location ?? null

const fetchTrace = async (): Promise<string> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), READ_TIMEOUT_MS)
  try {
    const response = await fetch('/cdn-cgi/trace', {
      signal: controller.signal,
      cache: 'no-store',
    })
    if (!response.ok) throw new Error(`trace ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

const UNKNOWN: VisitorLocation = { country: null, regionCode: null }

let visitorLocation: ReturnType<typeof createVisitorLocation> | null = null

export const readVisitorLocation = (): Promise<VisitorLocation> => {
  if (Platform.OS !== 'web') return Promise.resolve(UNKNOWN)
  visitorLocation ??= createVisitorLocation({
    fetchConfigLocation,
    fetchTrace,
    devOverride: devCountryOverride(),
  })
  return visitorLocation.location()
}

export const readVisitorCountry = async (): Promise<string | null> =>
  (await readVisitorLocation()).country
