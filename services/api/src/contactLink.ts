import type { AppContext } from './types'
import { HTTP_STATUS } from './config'
import { apiError } from './errors'
import { nameTransactionAfterRoute } from './sentry'
import {
  contactLinkDirection,
  contactLinkTranslations,
  resolveContactLinkLocale,
  type ContactLinkLocale,
} from './contactLinkLocales'
import {
  apexAssetOrigin,
  isApexLinkHost,
  pageOrigin,
  webAppOrigin,
} from './linkHosts'

/**
 * Contact-share universal link handlers.
 *
 * Flow: the WitnessWork app encodes a contact (gzip + base64url) into the URL
 * fragment and shares a URL like:
 *
 *   https://witnesswork.app/contacts#<payload>
 *
 * (older builds share `https://ww-proxy.leviwilkerson.com/c#<payload>`; both
 * hosts serve the page, docs/link-pages.md).
 *
 * Clients never send a fragment to a server, so link previews and the
 * fallback page only ever request the bare `/contacts` — the contact stays out
 * of this worker's requests, logs and Sentry.
 *
 * - iOS with the app installed: the OS intercepts the tap via the AASA file
 *   this worker serves and hands the URL to the app, which decodes and imports.
 * - iOS without the app / other platforms: the fallback HTML renders with a
 *   "Get WitnessWork" CTA linking to the App Store, and "Continue on the web"
 *   to the web app's `/contacts#<payload>`.
 *
 * Older app versions shared the short `/c#<payload>`, and the oldest put the
 * payload in the path (`/c/<payload>`). Those links are already out in the
 * wild, so both keep working for good.
 *
 * The AASA lists the prod, Beta (TestFlight), and dev bundle IDs so Beta and
 * development builds also intercept these links on devices where they're
 * installed.
 */

const PROD_BUNDLE_ID = 'com.leviwilkerson.jwtime'
const BETA_BUNDLE_ID = 'com.leviwilkerson.jwtimebeta'
const DEV_BUNDLE_ID = 'com.leviwilkerson.jwtimedev'
const APP_STORE_URL = 'https://apps.apple.com/us/app/jw-time/id6469723047'
const CONTACT_LINK_PATH = '/contacts'
const SHORT_CONTACT_LINK_PATH = '/c'
const LEGACY_CONTACT_LINK_PATH_PREFIX = `${SHORT_CONTACT_LINK_PATH}/`
const OG_IMAGE_PATH = '/assets/og-image.png'
const APPLE_TOUCH_ICON_PATH = '/assets/apple-touch-icon.png'
const IMPORT_DEEP_LINK_PREFIX = 'witnesswork://import-contact/'
/** The app's payload encoding: unpadded base64url. */
const BASE64URL = /^[A-Za-z0-9_-]+$/
const OPEN_APP_LINK_ID = 'open-app'
const CONTINUE_WEB_LINK_ID = 'continue-web'

/**
 * WitnessWork brand palette — mirrors `lightModeColors` in
 * `witness-work/src/constants/theme.ts`. Keep in sync if the app theme
 * changes.
 */
const BRAND = {
  accent: '#08cc50',
  accentBackground: '#4BD27C',
  accent3: '#003D46',
  text: '#373737',
  textInverse: '#FFFFFF',
  backgroundLightest: '#F0F0F0',
  card: '#FFFFFF',
  border: '#dbdbdb',
} as const

/**
 * Builds the "Open app" deep link and "Continue on the web" (its page in
 * `data-base`) in the browser from the fragment. Only a base64url payload
 * makes it into an href; anything else leaves the links hidden.
 */
const OPEN_APP_FROM_FRAGMENT_SCRIPT = `(function () {
  var payload = location.hash.slice(1);
  if (!${BASE64URL}.test(payload)) return;
  var link = document.getElementById('${OPEN_APP_LINK_ID}');
  link.href = '${IMPORT_DEEP_LINK_PREFIX}' + payload;
  link.hidden = false;
  var web = document.getElementById('${CONTINUE_WEB_LINK_ID}');
  if (!web) return;
  web.href = web.getAttribute('data-base') + '#' + payload;
  web.hidden = false;
})();`

/**
 * Apple strongly recommends `components` over the legacy `paths` array. Both
 * still work, but `components` supports per-pattern exclusions and query and
 * fragment matchers. Each link page matches with a non-empty fragment (`?*` =
 * at least one character; `1?*` = link format 1). The short paths (`/c`,
 * `/c/*`, `/b`, `/h`) are in links already shared, so they stay listed for
 * good: dropping one would open those links in Safari instead of the app.
 * The website apex (`apex`) never had short links, and the site Worker owns
 * every other path there, so it lists only the full-word ones.
 */
function buildAasaPayload(teamId: string, apex: boolean): object {
  const appIDs = [
    `${teamId}.${PROD_BUNDLE_ID}`,
    `${teamId}.${BETA_BUNDLE_ID}`,
    `${teamId}.${DEV_BUNDLE_ID}`,
  ]
  const components: Record<string, string>[] = [
    { '/': CONTACT_LINK_PATH, '#': '?*' },
    // Buddy invite `/buddies/invite#1<secret>`: the secret stays in the
    // fragment.
    { '/': '/buddies/invite', '#': '1?*' },
    // Set Up Another Device `/accounts/handoff#1<channel, key, secret>`,
    // likewise.
    { '/': '/accounts/handoff', '#': '1?*' },
  ]
  if (!apex) {
    // The short paths of links already shared.
    components.push(
      { '/': SHORT_CONTACT_LINK_PATH, '#': '?*' },
      { '/': `${LEGACY_CONTACT_LINK_PATH_PREFIX}*` },
      { '/': '/b', '#': '1?*' },
      { '/': '/h', '#': '1?*' }
    )
  }
  return { applinks: { details: [{ appIDs, components }] } }
}

export function handleAasaRequest(context: AppContext) {
  const teamId = context.env.APPLE_TEAM_ID
  if (!teamId) {
    // Fail loud so misconfigured deploys show up immediately instead of
    // silently breaking universal links.
    return apiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'server_error', {
      extras: { message: 'APPLE_TEAM_ID not configured' },
    })
  }
  // Apple requires Content-Type: application/json and no redirects. Hono's
  // c.json() sets the right header.
  return context.json(buildAasaPayload(teamId, isApexLinkHost(context.req.url)))
}

/**
 * `/contacts` (and the short `/c`) — the fallback page for fragment links.
 * The payload never reaches the worker, so the page's inline script builds
 * the "Open app" link instead.
 */
export function handleContactLinkRequest(context: AppContext) {
  nameTransactionAfterRoute(context)
  const locale = contactLinkLocale(context)
  const path =
    context.req.path === SHORT_CONTACT_LINK_PATH
      ? SHORT_CONTACT_LINK_PATH
      : CONTACT_LINK_PATH
  const web = webAppOrigin(context.env)
  const continueOnWeb = web
    ? `
    <a class="secondary" id="${CONTINUE_WEB_LINK_ID}" data-base="${escapeHtml(`${web}${CONTACT_LINK_PATH}`)}" hidden>${escapeHtml(contactLinkTranslations[locale].continueOnWeb)}</a>`
    : ''
  return context.html(
    renderFallbackPage(locale, path, pageOrigin(context.req.url), apexAssetOrigin(context.req.url), `<a class="secondary" id="${OPEN_APP_LINK_ID}" hidden>${escapeHtml(contactLinkTranslations[locale].openApp)}</a>${continueOnWeb}
    <script>${OPEN_APP_FROM_FRAGMENT_SCRIPT}</script>`)
  )
}

/**
 * `/c/<payload>` — links shared by older app versions. The payload is already
 * in the request, so the "Open app" link is rendered here, but it never goes
 * into meta tags, which link-preview services store.
 */
export function handleLegacyContactLinkRequest(context: AppContext) {
  nameTransactionAfterRoute(context)
  const locale = contactLinkLocale(context)
  const payload = context.req.param('payload') ?? ''
  const valid = BASE64URL.test(payload)
  const openAppLink = valid
    ? `<a class="secondary" href="${IMPORT_DEEP_LINK_PREFIX}${payload}">${escapeHtml(contactLinkTranslations[locale].openApp)}</a>`
    : ''
  // The web app reads the payload from its fragment, like `/contacts#…`.
  const web = webAppOrigin(context.env)
  const continueOnWeb =
    valid && web
      ? `
    <a class="secondary" id="${CONTINUE_WEB_LINK_ID}" href="${escapeHtml(`${web}${CONTACT_LINK_PATH}`)}#${payload}">${escapeHtml(contactLinkTranslations[locale].continueOnWeb)}</a>`
      : ''
  // Never the request path: it holds the payload.
  return context.html(
    renderFallbackPage(
      locale,
      SHORT_CONTACT_LINK_PATH,
      pageOrigin(context.req.url),
      apexAssetOrigin(context.req.url),
      openAppLink + continueOnWeb
    )
  )
}

function contactLinkLocale(context: AppContext): ContactLinkLocale {
  const locale = resolveContactLinkLocale(
    context.req.query('lang'),
    context.req.header('Accept-Language')
  )
  context.header('Content-Language', locale)
  context.header('Vary', 'Accept-Language', { append: true })
  return locale
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * Fallback HTML for taps that reach the worker (app not installed, non-iOS,
 * or Safari address-bar hit). Kept self-contained — no external fonts — so
 * iMessage's rich-link sniffer can render a fast preview. `og:url` is always
 * a bare page URL on the host it was served on (`/contacts` or `/c`, never a
 * payload), and `no-referrer`
 * keeps legacy page URLs out of the Referer header of follow-up requests.
 */
function renderFallbackPage(
  locale: ContactLinkLocale,
  path: typeof CONTACT_LINK_PATH | typeof SHORT_CONTACT_LINK_PATH,
  origin: string,
  assets: string | undefined,
  openAppLink: string
): string {
  const messages = contactLinkTranslations[locale]
  // On the apex the site owns `/assets/…`; the API host serves these.
  const ogImageUrl = `${assets ?? origin}${OG_IMAGE_PATH}`
  const appleTouchIconUrl = `${assets ?? origin}${APPLE_TOUCH_ICON_PATH}`
  const title = escapeHtml(messages.title)
  const description = escapeHtml(messages.description)
  const imageAlt = escapeHtml(messages.imageAlt)
  // Open Graph uses language_TERRITORY rather than BCP 47 script subtags.
  // Region-less Arabic becomes `ar_AR`, the code Open Graph uses for Arabic.
  const [language] = locale.split('-')
  const territory = locale.split('-').at(-1)!.toUpperCase()
  const dir = contactLinkDirection(locale) === 'rtl' ? ' dir="rtl"' : ''
  return `<!doctype html>
<html lang="${locale}"${dir}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex">
  <meta name="referrer" content="no-referrer">
  <title>${title}</title>
  <meta name="description" content="${description}">
  <meta name="theme-color" content="${BRAND.accentBackground}">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="WitnessWork">
  <meta property="og:locale" content="${language}_${territory}">
  <meta property="og:title" content="${title}">
  <meta property="og:description" content="${description}">
  <meta property="og:url" content="${origin}${path}">
  <meta property="og:image" content="${ogImageUrl}">
  <meta property="og:image:width" content="1024">
  <meta property="og:image:height" content="1024">
  <meta property="og:image:alt" content="${imageAlt}">

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${title}">
  <meta name="twitter:description" content="${description}">
  <meta name="twitter:image" content="${ogImageUrl}">
  <meta name="twitter:image:alt" content="${imageAlt}">

  <link rel="apple-touch-icon" href="${appleTouchIconUrl}">
  <link rel="icon" type="image/png" href="${appleTouchIconUrl}">

  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      background: ${BRAND.accentBackground};
      color: ${BRAND.text};
      margin: 0;
      padding: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
    }
    .card {
      background: ${BRAND.card};
      border: 1px solid ${BRAND.border};
      border-radius: 20px;
      padding: 2rem 1.75rem;
      max-width: 24rem;
      width: 100%;
      text-align: center;
      box-shadow: 0 10px 30px rgba(0, 61, 70, 0.15);
    }
    .icon {
      width: 88px;
      height: 88px;
      margin: 0 auto 1.25rem;
      display: block;
      /* drop-shadow follows the PNG alpha channel, so the shadow hugs the
         icon's rounded corners instead of sitting behind its transparent
         bounding box like box-shadow would. */
      filter: drop-shadow(0 4px 14px rgba(0, 61, 70, 0.2));
    }
    h1 {
      margin: 0 0 0.5rem;
      font-size: 1.35rem;
      color: ${BRAND.accent3};
    }
    p {
      margin: 0 0 1.5rem;
      color: ${BRAND.text};
      line-height: 1.45;
      font-size: 0.95rem;
    }
    a.btn {
      display: inline-block;
      background: ${BRAND.accent};
      color: ${BRAND.textInverse};
      text-decoration: none;
      padding: 0.85rem 1.75rem;
      border-radius: 999px;
      font-weight: 600;
      font-size: 1rem;
    }
    a.btn:hover { filter: brightness(1.05); }
    /* Text links, but a full 48px row each (44pt iOS, 48dp Android). */
    a.secondary {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 48px;
      margin-top: 0.5rem;
      color: ${BRAND.accent3};
      text-decoration: none;
      font-size: 0.85rem;
      opacity: 0.75;
    }
    a.secondary:hover { opacity: 1; }
  </style>
</head>
<body>
  <div class="card">
    <img class="icon" src="${appleTouchIconUrl}" alt="${imageAlt}" width="88" height="88">
    <h1>${title}</h1>
    <p>${escapeHtml(messages.instructions)}</p>
    <a class="btn" href="${APP_STORE_URL}">${escapeHtml(messages.getApp)}</a>
    ${openAppLink}
  </div>
</body>
</html>`
}
