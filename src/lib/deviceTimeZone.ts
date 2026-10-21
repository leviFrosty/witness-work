/** The device's time zone (an IANA id), or '' when the runtime can't tell. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

const YEAR_MS = 365 * 24 * 60 * 60_000
let probes = 0

/**
 * Hermes caches the device's UTC offset. After the time zone changes (travel),
 * `Date` keeps the old offset until it looks up a moment its cache doesn't
 * cover, so local times like "9:00 tomorrow" still come out in the old zone.
 * Reading a moment over a century away makes Hermes notice the new zone, and
 * the next date calculation uses it. Each call reads a year further out: the
 * cache also covers the weeks around every moment it has read, so a probe a few
 * minutes after an earlier one would hit it and miss a second change.
 */
export function refreshLocalTimeOffset() {
  probes++
  new Date(Date.now() + (100 + probes) * YEAR_MS).getTimezoneOffset()
  new Date().getTimezoneOffset()
}
