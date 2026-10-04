/**
 * Share links carry private data in the URL itself: a shared contact (with
 * visit notes) in `/c/<payload>` or after `#`, the
 * `witnesswork://import-contact/` hand-off from the fallback page, and secrets
 * in any other ww-proxy fragment. This scrubber retains the route and removes
 * the payload from diagnostic strings. Launch events use the stricter wrapper
 * below, which removes the entire URL.
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

/** Also applied on delivery: restored queues bypass the SDK capture hook. */
export function scrubAnalyticsEventProperties<T>(
  event: string,
  properties: Record<string, T> = {}
): Record<string, T | string> {
  const scrubbed = scrubShareLinkProperties(properties)
  // All launch URLs may contain private route IDs, query data or secrets.
  if (event === 'Application Opened') delete scrubbed.url
  return scrubbed
}
