const itunesItemId = 6469723047
const androidPackage = 'com.leviwilkerson.jwtime'
const githubRepo = 'https://github.com/leviFrosty/witness-work'

export default {
  privacyPolicy: 'https://leviwilkerson.com/witness-work/privacy',
  appStore: `https://apps.apple.com/us/app/jw-time/id${itunesItemId}`,
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
  termsOfUse: 'https://leviwilkerson.com/witness-work/terms',
  helpCenterSite: 'https://leviwilkerson.com',
  helpCenterManifest:
    'https://leviwilkerson.com/witness-work/help-center/bundle/manifest.json',
  helpCenterSearch: 'https://help-search.leviwilkerson.com/v1/search',
  nwpublisherSubmitReport: 'https://nwpublisher.com/report/',
  openRouterZdr: 'https://openrouter.ai/docs/guides/features/zdr',
}
