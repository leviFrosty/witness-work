/** The device's time zone (an IANA id), or '' when the runtime can't tell. */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? ''
  } catch {
    return ''
  }
}

const CENTURY_MS = 100 * 365 * 24 * 60 * 60_000

/**
 * Hermes caches the device's UTC offset. After the time zone changes (travel),
 * `Date` keeps the old offset until it looks up a moment its cache doesn't
 * cover, so local times like "9:00 tomorrow" still come out in the old zone. A
 * moment a century from now is never cached (it moves on with the clock), so
 * reading it makes Hermes notice the new zone, and the next date calculation
 * uses it.
 */
export function refreshLocalTimeOffset() {
  new Date(Date.now() + CENTURY_MS).getTimezoneOffset()
  new Date().getTimezoneOffset()
}
