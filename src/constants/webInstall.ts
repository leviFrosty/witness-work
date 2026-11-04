/**
 * Where the Install App banner sends an Android phone's browser (ADR 0037 §7).
 *
 * The owner's intended target is the Google Play listing, but it isn't public
 * yet (play.google.com answers 404 for it), so the banner installs the web app
 * to the home screen through the browser's own install prompt
 * (`beforeinstallprompt`). Once the listing is public, make the line below `{
 * source: 'play', url: links.playStore }`: the banner then shows on every
 * Android phone browser and opens the listing. That also changes what the
 * banner promises (`webInstall_message`) and ends `appinstalled`'s part in it,
 * since a Play install doesn't fire it in the browser.
 *
 * IPhone and iPad Safari get Apple's Smart App Banner from a `<meta>` tag in
 * `public/index.html` (`apple-itunes-app`; its id is `links.appStore`'s); the
 * app draws nothing there.
 */
export type AndroidInstallTarget =
  | { source: 'browser' }
  | { source: 'play'; url: string }

export const ANDROID_INSTALL_TARGET: AndroidInstallTarget = {
  source: 'browser',
}
