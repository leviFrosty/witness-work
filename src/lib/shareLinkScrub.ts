/**
 * Share links carry private data in the URL itself: a shared contact (with
 * visit notes) in `/c/<payload>` or after `#`, the
 * `witnesswork://import-contact/` hand-off from the fallback page, and secrets
 * in any other ww-proxy fragment. Analytics keep the route and drop the payload
 * — e.g. the `url` PostHog records on `Application Opened` when a link
 * cold-starts the app.
 */
export function scrubShareLinkUrl(value: string): string {
  return value
    .replace(/(ww-proxy\.leviwilkerson\.com\/c\/)[^\s#?"']+/g, '$1[redacted]')
    .replace(
      /(ww-proxy\.leviwilkerson\.com[^\s#"']*)#[^\s"']*/g,
      '$1#[redacted]'
    )
    .replace(/(import-contact\/)[^\s#?"']+/g, '$1[redacted]')
}

/** Scrubs every top-level string property. */
export function scrubShareLinkProperties<T>(
  properties: Record<string, T>
): Record<string, T | string> {
  return Object.fromEntries(
    Object.entries(properties).map(([key, value]) => [
      key,
      typeof value === 'string' ? scrubShareLinkUrl(value) : value,
    ])
  )
}
