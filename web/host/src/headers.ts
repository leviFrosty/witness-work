export type CspMode = 'report-only' | 'enforce'

export interface WebProfile {
  apiOrigin: string

  posthogOrigin: string

  mapsOrigin: string

  verifyOrigin: string

  helpManifest: string

  helpSearchOrigin: string

  csp: CspMode
}

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const REVALIDATE = 'public, max-age=0, must-revalidate'

export const HTML_CACHE = `${REVALIDATE}, no-transform`

export const PRECOMPRESSED_TYPES: Record<string, string> = {
  js: 'text/javascript; charset=utf-8',
  mjs: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  wasm: 'application/wasm',
  json: 'application/json',
  webmanifest: 'application/manifest+json',
  svg: 'image/svg+xml',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

export const REPORT_PATH = '/_csp-report'

export const REVENUECAT_ORIGINS = [
  'https://api.revenuecat.com',
  'https://e.revenue.cat',
]

export const TRUSTED_TYPES_POLICIES = ['ww-chunks', 'ProseMirrorClipboard']

const socketOrigin = (origin: string) => origin.replace(/^http/, 'ws')

export function connectOrigins(profile: WebProfile): string[] {
  return [
    profile.apiOrigin,
    socketOrigin(profile.apiOrigin),
    profile.posthogOrigin,
    new URL(profile.helpManifest).origin,
    profile.helpSearchOrigin,
    ...REVENUECAT_ORIGINS,
  ]
}

export function contentSecurityPolicy(profile: WebProfile): string {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],

    ['script-src', "'self'", "'wasm-unsafe-eval'"],

    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],

    ['connect-src', "'self'", ...connectOrigins(profile)],

    ['media-src', "'self'", 'blob:'],

    ['frame-src', profile.mapsOrigin, profile.verifyOrigin],
    ['worker-src', "'self'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'none'"],
    ['object-src', "'none'"],
    ['form-action', "'self'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', ...TRUSTED_TYPES_POLICIES],

    ['report-uri', REPORT_PATH],
  ]
  return directives.map((directive) => directive.join(' ')).join('; ')
}

export function securityHeaders(profile: WebProfile): Record<string, string> {
  return {
    [profile.csp === 'enforce'
      ? 'Content-Security-Policy'
      : 'Content-Security-Policy-Report-Only']: contentSecurityPolicy(profile),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Opener-Policy': 'same-origin',

    'Permissions-Policy':
      'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
    'X-Frame-Options': 'DENY',
  }
}

export function headersFile(profile: WebProfile): string {
  const lines = Object.entries({
    ...securityHeaders(profile),
    'Cache-Control': HTML_CACHE,
  }).map(([name, value]) => `  ${name}: ${value}`)
  return `/*\n${lines.join('\n')}\n`
}

export const HOLDING_CSP =
  "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"

export function holdingHeadersFile(profile: WebProfile): string {
  const headers = securityHeaders(profile)
  delete headers['Content-Security-Policy']
  delete headers['Content-Security-Policy-Report-Only']
  const lines = Object.entries({
    'Content-Security-Policy': HOLDING_CSP,
    ...headers,
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
  }).map(([name, value]) => `  ${name}: ${value}`)
  return `/*\n${lines.join('\n')}\n`
}
