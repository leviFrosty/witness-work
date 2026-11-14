export type AppProfile = { host: string; mapsOrigin: string }

export type FrameEnvironment = {
  worker: string

  origin: string
}

export const FRAME_ENVIRONMENTS: Record<string, FrameEnvironment> = {
  beta: { worker: 'ww-maps-beta', origin: 'https://maps-beta.witnesswork.app' },
  production: { worker: 'ww-maps', origin: 'https://maps.witnesswork.app' },
}

export const MAPKIT_SCRIPT_ORIGIN = 'https://cdn.apple-mapkit.com'

export const MAPKIT_HOSTS = [
  'https://*.apple-mapkit.com',
  'https://*.ls.apple.com',
]

export function appOriginsFor(
  frameOrigin: string,
  profiles: Record<string, AppProfile>
): string[] {
  const origins = Object.values(profiles)
    .filter((profile) => profile.mapsOrigin === frameOrigin)
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
    ['script-src', "'self'", MAPKIT_SCRIPT_ORIGIN],

    ['style-src', "'self'", "'unsafe-inline'", MAPKIT_SCRIPT_ORIGIN],
    ['img-src', "'self'", 'data:', 'blob:', ...MAPKIT_HOSTS],
    ['font-src', "'self'", ...MAPKIT_HOSTS],
    ['connect-src', ...MAPKIT_HOSTS],
    ['worker-src', 'blob:'],
    ['frame-src', "'none'"],

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
