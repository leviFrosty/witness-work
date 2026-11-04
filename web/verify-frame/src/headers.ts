// The Turnstile frame's headers (docs/web-turnstile.md). `scripts/web-verify.mjs`
// writes them into the frame's `_headers`, which Workers Static Assets serves
// with every file. Keep this file free of imports: Node runs it directly, with
// types stripped.

/** The web app profiles' fields this needs (`config/web-environments.json`). */
export type AppProfile = { host: string; verifyOrigin: string }

/** A frame deploy: one origin, the app origins that may frame it. */
export type FrameEnvironment = {
  /** The frame Worker. */
  worker: string
  /** `https://verify…`, as the app's profiles name it. */
  origin: string
}

export const FRAME_ENVIRONMENTS: Record<string, FrameEnvironment> = {
  dev: {
    worker: 'ww-verify-dev',
    origin: 'https://verify-dev.witnesswork.app',
  },
  production: { worker: 'ww-verify', origin: 'https://verify.witnesswork.app' },
}

/** Turnstile's script, and the frame it draws the widget in. */
export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

/**
 * The app origins that frame `frameOrigin`: every web profile whose Turnstile
 * frame it is. The local profile (`localhost`) runs on any port, on either
 * name.
 */
export function appOriginsFor(
  frameOrigin: string,
  profiles: Record<string, AppProfile>
): string[] {
  const origins = Object.values(profiles)
    .filter((profile) => profile.verifyOrigin === frameOrigin)
    .flatMap((profile) =>
      profile.host === 'localhost'
        ? ['http://localhost:*', 'http://127.0.0.1:*']
        : [`https://${profile.host}`]
    )
  return [...new Set(origins)]
}

export function frameContentSecurityPolicy(appOrigins: string[]): string {
  if (appOrigins.length === 0) throw new Error('A frame needs its app origins')
  const directives: [string, ...string[]][] = [
    ['default-src', "'none'"],
    ['script-src', "'self'", TURNSTILE_ORIGIN],
    ['style-src', "'self'"],
    // Turnstile draws its widget in its own frame, which connects on its own.
    ['frame-src', TURNSTILE_ORIGIN],
    // Only the app may frame it; nothing else can show it or hear its token.
    ['frame-ancestors', ...appOrigins],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['object-src', "'none'"],
  ]
  return directives.map((directive) => directive.join(' ')).join('; ')
}

/** Every powerful feature, off: a check needs none of them. */
const DENIED_FEATURES = [
  'accelerometer',
  'autoplay',
  'bluetooth',
  'camera',
  'clipboard-read',
  'clipboard-write',
  'display-capture',
  'encrypted-media',
  'fullscreen',
  'geolocation',
  'gyroscope',
  'hid',
  'identity-credentials-get',
  'idle-detection',
  'local-fonts',
  'magnetometer',
  'microphone',
  'midi',
  'otp-credentials',
  'payment',
  'picture-in-picture',
  'publickey-credentials-create',
  'publickey-credentials-get',
  'screen-wake-lock',
  'serial',
  'storage-access',
  'usb',
  'web-share',
  'window-management',
  'xr-spatial-tracking',
]

export function frameHeaders(appOrigins: string[]): Record<string, string> {
  return {
    'Content-Security-Policy': frameContentSecurityPolicy(appOrigins),
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Permissions-Policy': DENIED_FEATURES.map((name) => `${name}=()`).join(
      ', '
    ),
    'Cache-Control': 'public, max-age=0, must-revalidate',
  }
}

/** `_headers` for every file the frame serves. */
export function frameHeadersFile(appOrigins: string[]): string {
  const lines = Object.entries(frameHeaders(appOrigins)).map(
    ([name, value]) => `  ${name}: ${value}`
  )
  return `/*\n${lines.join('\n')}\n`
}
