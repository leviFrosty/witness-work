export type AppProfile = { host: string; verifyOrigin: string }

export type FrameEnvironment = {
  worker: string

  origin: string
}

export const FRAME_ENVIRONMENTS: Record<string, FrameEnvironment> = {
  beta: {
    worker: 'ww-verify-beta',
    origin: 'https://verify-beta.witnesswork.app',
  },
  production: { worker: 'ww-verify', origin: 'https://verify.witnesswork.app' },
}

export const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com'

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

    ['frame-src', TURNSTILE_ORIGIN],

    ['frame-ancestors', ...appOrigins],
    ['base-uri', "'none'"],
    ['form-action', "'none'"],
    ['object-src', "'none'"],
  ]
  return directives.map((directive) => directive.join(' ')).join('; ')
}

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

export function frameHeadersFile(appOrigins: string[]): string {
  const lines = Object.entries(frameHeaders(appOrigins)).map(
    ([name, value]) => `  ${name}: ${value}`
  )
  return `/*\n${lines.join('\n')}\n`
}
