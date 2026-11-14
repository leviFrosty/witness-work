import type { AppContext } from '../types'
import {
  FRAGMENT_LINKS_SCRIPT,
  LEGACY_LINK_ORIGIN,
  apexAssetOrigin,
  imageSources,
  isApexLinkHost,
  pageOrigin,
  scriptSource,
  webAppOrigin,
} from '../linkHosts'

/**
 * `GET /buddies/invite` — no-app fallback for Buddy invite links
 * (`https://witnesswork.app/buddies/invite#1<secret>`, and older builds'
 * `https://ww-proxy.leviwilkerson.com/b#1<secret>`). Every host serves it
 * (docs/link-pages.md); the short `/b` is on the old host only.
 *
 * The secret lives in the fragment, which browsers never send to a server.
 * This handler reads nothing from the request but its host, and the page is
 * generic (no names, no ids). Its one inline script copies the invite link to
 * the clipboard on tap (always the old host's `/b#…`, the one form every
 * build's paste field reads) and builds "Continue on the web" (and, on the apex,
 * "Open in WitnessWork") from the fragment; the CSP (`connect-src` falls back
 * to `'none'`) keeps the page from sending anything anywhere.
 */

const APP_STORE_URL = 'https://apps.apple.com/us/app/jw-time/id6469723047'
const GOOGLE_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime'
const OG_IMAGE_PATH = '/assets/og-image.png'
const ICON_PATH = '/assets/apple-touch-icon.png'
const OG_TITLE = 'A WitnessWork buddy invite'
const OG_DESCRIPTION =
  'Open this invite in WitnessWork, the service time and contact management app for Jehovah’s Witnesses.'

const INVITE_PATH = '/buddies/invite'
const SHORT_INVITE_PATH = '/b'

/**
 * On the apex, "Open in WitnessWork" goes to the old host's `/b`, which every
 * build claims and parses: a tap on a link to another domain opens the app.
 */
const OPEN_APP_BASE = `${LEGACY_LINK_ORIGIN}${SHORT_INVITE_PATH}`

const COPY_SCRIPT = `
(function () {
  var button = document.getElementById('copy');
  var status = document.getElementById('copy-status');
  function show(message) { status.textContent = message; }
  var fragment = location.hash.slice(1);
  var link = /^[A-Za-z0-9_-]+$/.test(fragment)
    ? '${OPEN_APP_BASE}#' + fragment
    : location.href;
  function fallback() {
    var field = document.createElement('textarea');
    field.value = link;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    var copied = false;
    try { copied = document.execCommand('copy'); } catch (e) {}
    document.body.removeChild(field);
    show(copied ? 'Invite link copied.' : 'Copy the link from the address bar instead.');
  }
  button.hidden = false;
  button.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(function () {
        show('Invite link copied.');
      }, fallback);
    } else {
      fallback();
    }
  });
})();
`

const PAGE_SCRIPT = COPY_SCRIPT + FRAGMENT_LINKS_SCRIPT

const renderPage = (
  path: typeof INVITE_PATH | typeof SHORT_INVITE_PATH,
  origin: string,
  apex: boolean,
  assets: string | undefined,
  web: string | undefined
): string => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <title>${OG_TITLE}</title>
  <meta name="description" content="${OG_DESCRIPTION}">
  <meta name="theme-color" content="#4BD27C">

  <meta property="og:type" content="website">
  <meta property="og:site_name" content="WitnessWork">
  <meta property="og:title" content="${OG_TITLE}">
  <meta property="og:description" content="${OG_DESCRIPTION}">
  <meta property="og:url" content="${origin}${path}">
  <meta property="og:image" content="${assets ?? origin}${OG_IMAGE_PATH}">
  <meta property="og:image:alt" content="WitnessWork app icon">
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="${OG_TITLE}">
  <meta name="twitter:description" content="${OG_DESCRIPTION}">

  <link rel="apple-touch-icon" href="${assets ?? ''}${ICON_PATH}">
  <style>
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
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
      border: 0;
      background: #08cc50;
      color: #FFFFFF;
      text-decoration: none;
      padding: 0.85rem 1.75rem;
      border-radius: 999px;
      font: inherit;
      font-weight: 600;
      font-size: 1rem;
      cursor: pointer;
    }
    .stores { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; margin-bottom: 1.25rem; }
    .stores .btn { width: 100%; max-width: 16rem; box-sizing: border-box; }
    .btn.secondary { background: #F0F0F0; color: #003D46; margin-top: 0.75rem; }
    .status { min-height: 1.25rem; margin: 0.75rem 0 0; font-size: 0.85rem; }
  </style>
</head>
<body>
  <main class="card">
    <img class="icon" src="${assets ?? ''}${ICON_PATH}" alt="WitnessWork" width="88" height="88">
    <h1>Open this invite in WitnessWork</h1>
    <p>Install WitnessWork from the App Store or Google Play. After installing, tap the invite link again to open it in the app.</p>
    <div class="stores">
      <a class="btn" href="${APP_STORE_URL}">Get it on the App Store</a>
      <a class="btn" href="${GOOGLE_PLAY_URL}">Get it on Google Play</a>
    </div>${apex ? `
    <div><a id="open-app" class="btn secondary" data-base="${OPEN_APP_BASE}" hidden>Open in WitnessWork</a></div>` : ''}${web ? `
    <div><a id="continue-web" class="btn secondary" data-base="${web}${INVITE_PATH}" hidden>Continue on the web</a></div>` : ''}
    <div><button id="copy" class="btn secondary" type="button" hidden>Copy invite link</button></div>
    <p id="copy-status" class="status" role="status"></p>
    <p>Already have the app? Copy the invite link and paste it in WitnessWork.</p>
  </main>
  <script>${PAGE_SCRIPT}</script>
</body>
</html>`

export const handleBuddyInvitePage = async (
  context: AppContext
): Promise<Response> => {
  const policy = [
    "default-src 'none'",
    `img-src ${imageSources(context.req.url)}`,
    "style-src 'unsafe-inline'",
    `script-src ${await scriptSource(PAGE_SCRIPT)}`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ')
  const path =
    context.req.path === SHORT_INVITE_PATH ? SHORT_INVITE_PATH : INVITE_PATH
  const page = renderPage(
    path,
    pageOrigin(context.req.url),
    isApexLinkHost(context.req.url),
    apexAssetOrigin(context.req.url),
    webAppOrigin(context.env)
  )
  return context.html(page, 200, {
    'Cache-Control': 'public, max-age=3600',
    'Content-Security-Policy': policy,
    'Referrer-Policy': 'no-referrer',
    'X-Robots-Tag': 'noindex, nofollow',
  })
}
