import { forBuild } from '@/constants/buildVariant'

const itunesItemId = 6469723047
const androidPackage = 'com.leviwilkerson.jwtime'
const githubRepo = 'https://github.com/leviFrosty/witness-work'

const BETA_SITE = 'https://beta.witnesswork.app'
const BETA_HELP_SEARCH = 'https://help-search-beta.witnesswork.app/v1/search'
const BETA_MAPS_FRAME = 'https://maps-beta.witnesswork.app'
const BETA_TURNSTILE_FRAME = 'https://verify-beta.witnesswork.app'

const site = forBuild({
  development: BETA_SITE,
  beta: BETA_SITE,
  production: 'https://witnesswork.app',
})

export default {
  privacyPolicy: `${site}/privacy`,
  appStore: `https://apps.apple.com/us/app/jw-time/id${itunesItemId}`,

  appStoreAnyStorefront: `https://apps.apple.com/app/id${itunesItemId}`,
  appStoreReview: `itms-apps://itunes.apple.com/app/viewContentsUserReviews/id${itunesItemId}?action=write-review`,
  playStore: `https://play.google.com/store/apps/details?id=${androidPackage}`,

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
    development: BETA_HELP_SEARCH,
    beta: BETA_HELP_SEARCH,
    production: 'https://help-search.witnesswork.app/v1/search',
  }),

  mapsFrame: forBuild({
    development: BETA_MAPS_FRAME,
    beta: BETA_MAPS_FRAME,
    production: 'https://maps.witnesswork.app',
  }),

  turnstileFrame: forBuild({
    development: BETA_TURNSTILE_FRAME,
    beta: BETA_TURNSTILE_FRAME,
    production: 'https://verify.witnesswork.app',
  }),
  nwpublisherSubmitReport: 'https://nwpublisher.com/report/',
  openRouterZdr: 'https://openrouter.ai/docs/guides/features/zdr',
}
