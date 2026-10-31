// Security headers for the web app (ADR 0037 §5). The Worker sets them on
// the responses its code produces, and `scripts/web-host.mjs` writes the same
// set into `_headers` for everything Cloudflare serves straight from assets.
// Keep this file free of imports: Node runs it directly, with types stripped.

export type CspMode = 'report-only' | 'enforce'

export interface WebProfile {
  /** The build's ww-api origin; its WebSocket origin is derived from it. */
  apiOrigin: string
  /** PostHog ingestion host the build sends events to. */
  posthogOrigin: string
  /** The MapKit JS frame (ADR 0037 §8). */
  mapsOrigin: string
  /** One switch per environment: report violations, or block them. */
  csp: CspMode
}

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const REVALIDATE = 'public, max-age=0, must-revalidate'

/** Where browsers post CSP and Trusted Types violations. */
export const REPORT_PATH = '/_csp-report'

/**
 * The website and Help Center search (ADR 0042), plus the old hosts the app
 * still reads until the domain move finishes.
 */
export const SITE_ORIGINS = [
  'https://witnesswork.app',
  'https://help-search.witnesswork.app',
  'https://leviwilkerson.com',
  'https://help-search.leviwilkerson.com',
]

/**
 * RevenueCat's API in browser mode: prices, customer info, and the SDK's own
 * events (ADR 0041). Checkout runs on RevenueCat's page, so no RevenueCat or
 * Stripe script runs here and `script-src` stays `'self'`.
 */
export const REVENUECAT_ORIGINS = [
  'https://api.revenuecat.com',
  'https://e.revenue.cat',
]

const socketOrigin = (origin: string) => origin.replace(/^http/, 'ws')

export function contentSecurityPolicy(profile: WebProfile): string {
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // CanvasKit compiles its wasm at runtime.
    ['script-src', "'self'", "'wasm-unsafe-eval'"],
    // react-native-web writes its styles into <style> tags at runtime, and
    // Expo's index.html carries an inline reset.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],
    [
      'connect-src',
      "'self'",
      profile.apiOrigin,
      socketOrigin(profile.apiOrigin),
      profile.posthogOrigin,
      ...SITE_ORIGINS,
      ...REVENUECAT_ORIGINS,
    ],
    ['frame-src', profile.mapsOrigin],
    ['worker-src', "'self'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'none'"],
    ['object-src', "'none'"],
    ['form-action', "'self'"],
    ['require-trusted-types-for', "'script'"],
    // Every engine delivers `report-uri`. Chromium ignores it once `report-to`
    // is present, and its Reporting API uploads never arrived in our checks.
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
    // Scribe AI records voice and takes photos; the Map can center on the
    // User. Nothing else gets a powerful feature.
    'Permissions-Policy':
      'camera=(self), microphone=(self), geolocation=(self), payment=(), usb=(), serial=(), hid=(), bluetooth=(), midi=()',
    'X-Frame-Options': 'DENY',
  }
}

/** `_headers` for responses Cloudflare serves from assets without the Worker. */
export function headersFile(profile: WebProfile): string {
  const lines = Object.entries(securityHeaders(profile)).map(
    ([name, value]) => `  ${name}: ${value}`
  )
  return `/*\n${lines.join('\n')}\n`
}
