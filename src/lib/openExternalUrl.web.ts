const ALLOWED_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  'sms:',
])

export const openExternalUrl = async (url: string): Promise<void> => {
  if (typeof window === 'undefined' || typeof window.open !== 'function') {
    throw new Error('Cannot open URL without a browser window')
  }
  const parsed = new URL(url)
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`)
  }
  window.open(parsed.href, '_blank', 'noopener,noreferrer')
}
