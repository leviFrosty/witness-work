import type { AppContext } from '../types'
import {
  contactLinkDirection,
  contactLinkTranslations,
  resolveContactLinkLocale,
  type ContactLinkLocale,
} from '../contactLinkLocales'
import {
  FRAGMENT_LINKS_SCRIPT,
  LEGACY_LINK_ORIGIN,
  apexAssetOrigin,
  imageSources,
  isApexLinkHost,
  pageOrigin,
  scriptSource,
} from '../linkHosts'
import { handoffPageTranslations } from './handoffPageLocales'

/**
 * `GET /accounts/handoff` (and the short `/h`): the page a phone's camera
 * opens for a Set Up Another Device QR code
 * (`https://witnesswork.app/accounts/handoff#1<channel, key, secret>`, and
 * older builds' `https://ww-proxy.leviwilkerson.com/h#1…`) when WitnessWork
 * doesn't catch the link. It says to install or open the app on the new
 * phone and scan the code from inside it.
 *
 * The handoff secret lives in the fragment, which browsers never send. The
 * page reads nothing from the request but its host and the language
 * (`?lang=` or `Accept-Language`, as on `/contacts`), and its CSP lets it
 * load nothing but its icon (from the API host on the apex), so it can't send the fragment anywhere. It
 * runs no script, except on the apex: there one builds "Open app" to the old
 * host's `/h#…`, which every build claims and parses (a tap on a link to
 * another domain opens the app).
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/jw-time/id6469723047'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime'
const OG_IMAGE_PATH = '/assets/og-image.png'
const ICON_PATH = '/assets/apple-touch-icon.png'
const OPEN_APP_BASE = `${LEGACY_LINK_ORIGIN}/h`

const contentSecurityPolicy = (images: string, script?: string) =>
  [
    "default-src 'none'",
    `img-src ${images}`,
    "style-src 'unsafe-inline'",
    ...(script ? [`script-src ${script}`] : []),
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const HANDOFF_PATH = '/accounts/handoff'
const SHORT_HANDOFF_PATH = '/h'

const renderPage = (
  locale: ContactLinkLocale,
  path: typeof HANDOFF_PATH | typeof SHORT_HANDOFF_PATH,
  origin: string,
  apex: boolean,
  assets: string | undefined
): string => {
  const messages = handoffPageTranslations[locale]
  const title = escapeHtml(messages.title)
  const description = escapeHtml(messages.description)
  const imageAlt = escapeHtml(messages.imageAlt)
  const dir = contactLinkDirection(locale) === 'rtl' ? ' dir="rtl"' : ''
  return `<!doctype html>
<html lang="${locale}"${dir}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="#4BD27C">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="WitnessWork">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${origin}${path}">
  <meta property="og:image" content="${assets ?? origin}${OG_IMAGE_PATH}">
  <meta property="og:image:alt" content="${imageAlt}">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">

  <link rel="apple-touch-icon" href="${assets ?? ''}${ICON_PATH}">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: #4BD27C;
      color: #373737;
      margin: 0;
      padding: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: #FFFFFF;
      border: 1px solid #dbdbdb;
      border-radius: 20px;
      padding: 2rem 1.75rem;
      max-width: 24rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 61, 70, 0.15);
    }
    .icon { width: 88px; height: 88px; margin: 0 auto 1.25rem; display: block; }
    h1 { margin: 0 0 0.5rem; font-size: 1.35rem; color: #003D46; }
    p { margin: 0 0 1.25rem; line-height: 1.45; font-size: 0.95rem; }
    .btn {
      display: inline-block;
      background: #08cc50;
      color: #FFFFFF;
      text-decoration: none;
      padding: 0.85rem 1.75rem;
      border-radius: 999px;
      font-weight: 600;
      font-size: 1rem;
    }
    .stores { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
    .stores .btn { width: 100%; max-width: 16rem; }${apex ? `
    [hidden] { display: none !important; }
    .btn.secondary { background: #F0F0F0; color: #003D46; margin-top: 1.25rem; }` : ''}
  </style>
</head>
<body>
  <main class="card">
    <img class="icon" src="${assets ?? ''}${ICON_PATH}" alt="${imageAlt}" width="88" height="88">
    <h1>${title}</h1>
    <p>${escapeHtml(messages.instructions)}</p>
    <div class="stores">
      <a class="btn" href="${APP_STORE_URL}">${escapeHtml(messages.appStore)}</a>
      <a class="btn" href="${GOOGLE_PLAY_URL}">${escapeHtml(messages.googlePlay)}</a>
    </div>${apex ? `
    <a id="open-app" class="btn secondary" data-base="${OPEN_APP_BASE}" hidden>${escapeHtml(contactLinkTranslations[locale].openApp)}</a>` : ''}
  </main>${apex ? `
  <script>${FRAGMENT_LINKS_SCRIPT}</script>` : ''}
</body>
</html>`
}

export const handleHandoffPage = async (
  context: AppContext
): Promise<Response> => {
  const locale = resolveContactLinkLocale(
    context.req.query('lang'),
    context.req.header('Accept-Language')
  )
  const path =
    context.req.path === SHORT_HANDOFF_PATH ? SHORT_HANDOFF_PATH : HANDOFF_PATH
  const apex = isApexLinkHost(context.req.url)
  const page = renderPage(
    locale,
    path,
    pageOrigin(context.req.url),
    apex,
    apexAssetOrigin(context.req.url)
  )
  const script = apex ? await scriptSource(FRAGMENT_LINKS_SCRIPT) : undefined
  return context.html(page, 200, {
    'Cache-Control': 'public, max-age=3600',
    'Content-Language': locale,
    Vary: 'Accept-Language',
    'Content-Security-Policy': contentSecurityPolicy(
      imageSources(context.req.url),
      script
    ),
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  }) as Response
}
