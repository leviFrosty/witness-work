import { forBuild } from '@/constants/buildVariant'

const itunesItemId = 6469723047
const androidPackage = 'com.leviwilkerson.jwtime'
const githubRepo = 'https://github.com/leviFrosty/witness-work'
/** The website (ADR 0042); development builds use its staging deploy. */
const site = forBuild({
  development: 'https://dev.witnesswork.app',
  release: 'https://witnesswork.app',
})

export default {
  privacyPolicy: `${site}/privacy`,
  appStore: `https://apps.apple.com/us/app/jw-time/id${itunesItemId}`,
  /** The App Store page without a storefront, so it opens in the visitor's. */
  appStoreAnyStorefront: `https://apps.apple.com/app/id${itunesItemId}`,
  appStoreReview: `itms-apps://itunes.apple.com/app/viewContentsUserReviews/id${itunesItemId}?action=write-review`,
  playStore: `https://play.google.com/store/apps/details?id=${androidPackage}`,
  /** Opens the Play Store app itself; `playStore` is the fallback. */
  playStoreApp: `market://details?id=${androidPackage}`,
  githubRepo,
  appleMapsBase: 'https://maps.apple.com/?q=',
  googleMapsBase: 'https://www.google.com/maps/search/?api=1&query=',
  wazeMapsBase: 'https://waze.com/ul?q=',
  hourglassBase: 'https://app.hourglass-app.com/report/submit?',
  bugReport: `${githubRepo}/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=%5BBUG%5D`,
  featureRequest: `${githubRepo}/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=%5BFEATURE%5D`,
  donate: 'https://ko-fi.com/leviwilkerson',
  termsOfUse: `${site}/terms`,
  helpCenterSite: site,
  helpCenterManifest: `${site}/help/bundle/manifest.json`,
  helpCenterSearch: forBuild({
    development: 'https://help-search-dev.witnesswork.app/v1/search',
    release: 'https://help-search.witnesswork.app/v1/search',
  }),
  nwpublisherSubmitReport: 'https://nwpublisher.com/report/',
  openRouterZdr: 'https://openrouter.ai/docs/guides/features/zdr',
}
