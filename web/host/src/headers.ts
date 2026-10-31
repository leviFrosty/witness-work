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
  /** The MapKit JS frame (ADR 0037 §8), the only thing the app frames. */
  mapsOrigin: string
  /** The Help Center's manifest, on the website the build reads it from. */
  helpManifest: string
  /** The Help Center's search, next to that website (ADR 0042). */
  helpSearchOrigin: string
  /** One switch per environment: report violations, or block them. */
  csp: CspMode
}

export const IMMUTABLE = 'public, max-age=31536000, immutable'
export const REVALIDATE = 'public, max-age=0, must-revalidate'

/** Where browsers post CSP and Trusted Types violations. */
export const REPORT_PATH = '/_csp-report'

/**
 * RevenueCat's API in browser mode: prices, customer info, and the SDK's own
 * events (ADR 0041). Every profile uses the same hosts. Checkout runs on
 * RevenueCat's page, so no RevenueCat or Stripe script runs here.
 */
export const REVENUECAT_ORIGINS = [
  'https://api.revenuecat.com',
  'https://e.revenue.cat',
]

/**
 * Cloudflare Turnstile, the check before a recovery key signs this browser in
 * (ADR 0038): its script, and the frame it renders the widget in. Every profile
 * uses the same host.
 */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * The Trusted Types policies the page may create, each only once:
 *
 * - `ww-chunks`, the app's own (`CHUNK_POLICY` in
 *   `src/vendor/web/trustedTypes.ts`), for its script chunks.
 * - `ProseMirrorClipboard`, which the note editor creates the first time HTML is
 *   pasted, to parse it in a detached document that never renders or runs it;
 *   the editor keeps only the nodes its schema knows.
 * - `ww-turnstile`, which the sign-in screen creates to load Turnstile's one
 *   script URL (`src/app/web-sign-in/components/Turnstile.tsx`).
 *
 * No `default` policy, so every other sink still refuses a string.
 */
export const TRUSTED_TYPES_POLICIES = [
  'ww-chunks',
  'ProseMirrorClipboard',
  'ww-turnstile',
]

const socketOrigin = (origin: string) => origin.replace(/^http/, 'ws')

/**
 * Every origin a profile's build talks to, all from its profile in
 * `config/web-environments.json`, so the app's hosts and its CSP can't drift
 * apart. Nothing from another profile is allowed.
 */
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
    // CanvasKit compiles its wasm at runtime; Turnstile's script, on sign-in.
    ['script-src', "'self'", "'wasm-unsafe-eval'", TURNSTILE_ORIGIN],
    // react-native-web writes its styles into <style> tags at runtime, and
    // Expo's index.html carries an inline reset.
    ['style-src', "'self'", "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'", 'data:'],
    // Bundled PostHog sends events and session replay to its ingestion host
    // only (ADR 0043); nothing loads from PostHog.
    ['connect-src', "'self'", ...connectOrigins(profile)],
    // Scribe AI plays back the voice it just recorded from a `blob:` URL.
    ['media-src', "'self'", 'blob:'],
    // MapKit JS runs only inside this frame, on its own origin; Turnstile's
    // widget in its own.
    ['frame-src', profile.mapsOrigin, TURNSTILE_ORIGIN],
    ['worker-src', "'self'"],
    ['frame-ancestors', "'none'"],
    ['base-uri', "'none'"],
    ['object-src', "'none'"],
    ['form-action', "'self'"],
    ['require-trusted-types-for', "'script'"],
    ['trusted-types', ...TRUSTED_TYPES_POLICIES],
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
