export function scrubShareLinkUrl(value: string): string {
  return value
    .replace(/(ww-proxy\.leviwilkerson\.com\/c\/)[^\s#?"']+/g, '$1[redacted]')
    .replace(
      /(ww-proxy\.leviwilkerson\.com[^\s#"']*)#[^\s"']*/g,
      '$1#[redacted]'
    )
    .replace(/(import-contact\/)[^\s#?"']+/g, '$1[redacted]')
}

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

export function scrubAnalyticsEventProperties<T>(
  event: string,
  properties: Record<string, T> = {}
): Record<string, T | string> {
  const scrubbed = scrubShareLinkProperties(properties)

  if (event === 'Application Opened') delete scrubbed.url
  return scrubbed
}
