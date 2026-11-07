export type VisitorLocation = {
  country: string | null

  regionCode: string | null
}

const UNKNOWN_LOCATION: VisitorLocation = { country: null, regionCode: null }

const COUNTRY = /^[A-Za-z]{2}$/

const REGION = /^[A-Za-z0-9]{1,3}$/

const UNKNOWN = new Set(['XX', 'T1'])

const toCountry = (value: unknown): string | null => {
  if (typeof value !== 'string' || !COUNTRY.test(value)) return null
  const code = value.toUpperCase()
  return UNKNOWN.has(code) ? null : code
}

export const parseVisitorLocation = (
  country: unknown,
  regionCode: unknown
): VisitorLocation => {
  const code = toCountry(country)
  if (!code) return UNKNOWN_LOCATION
  const region = typeof regionCode === 'string' ? regionCode.toUpperCase() : ''
  const written = region.startsWith(`${code}-`)
    ? region.slice(code.length + 1)
    : region
  return { country: code, regionCode: REGION.test(written) ? written : null }
}

export const parseDevLocation = (
  value: string | null | undefined
): VisitorLocation | null => {
  if (typeof value !== 'string') return null
  const match = /^([A-Za-z0-9]+)(?:-([A-Za-z0-9]{1,3}))?$/.exec(value.trim())
  const location = match && parseVisitorLocation(match[1], match[2] ?? null)
  return location?.country ? location : null
}

export const parseCloudflareTrace = (text: string): string | null => {
  if (typeof text !== 'string') return null
  const line = text.split('\n').find((l) => l.startsWith('loc='))
  return line ? toCountry(line.slice('loc='.length).trim()) : null
}

export const createVisitorLocation = ({
  fetchConfigLocation,
  fetchTrace,
  devOverride,
}: {
  fetchConfigLocation: () => Promise<VisitorLocation | null>
  fetchTrace: () => Promise<string>
  devOverride?: string | null
}) => {
  const fromTrace = async (): Promise<VisitorLocation> => {
    try {
      return {
        country: parseCloudflareTrace(await fetchTrace()),
        regionCode: null,
      }
    } catch {
      return UNKNOWN_LOCATION
    }
  }

  const read = async (): Promise<{
    location: VisitorLocation
    keep: boolean
  }> => {
    const override = parseDevLocation(devOverride)
    if (override) return { location: override, keep: true }
    let fromConfig: VisitorLocation | null
    try {
      fromConfig = await fetchConfigLocation()
    } catch {
      return { location: await fromTrace(), keep: false }
    }
    if (fromConfig?.country) return { location: fromConfig, keep: true }
    return { location: await fromTrace(), keep: true }
  }
  let pending: Promise<VisitorLocation> | null = null
  return {
    location: (): Promise<VisitorLocation> => {
      if (pending) return pending
      const attempt = read()
      const location = attempt.then((result) => result.location)
      pending = location
      void attempt.then((result) => {
        if (!result.keep && pending === location) pending = null
      })
      return location
    },
  }
}
