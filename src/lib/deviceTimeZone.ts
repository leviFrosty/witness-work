export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

const YEAR_MS = 365 * 24 * 60 * 60_000
let probes = 0

export function refreshLocalTimeOffset() {
  probes++
  new Date(Date.now() + (100 + probes) * YEAR_MS).getTimezoneOffset()
  new Date().getTimezoneOffset()
}
