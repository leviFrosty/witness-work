const itunesItemId = 6469723047
const githubRepo = 'https://github.com/leviFrosty/witness-work'

export default {
  privacyPolicy: 'https://leviwilkerson.com/witness-work/privacy',
  appStore: `https://apps.apple.com/us/app/jw-time/id${itunesItemId}`,
  appStoreReview: `itms-apps://itunes.apple.com/app/viewContentsUserReviews/id${itunesItemId}?action=write-review`,
  githubRepo,
  appleMapsBase: 'http://maps.apple.com/?q=',
  googleMapsBase: 'https://www.google.com/maps/search/?api=1&query=',
  wazeMapsBase: 'https://waze.com/ul?q=',
  hourglassBase: 'https://app.hourglass-app.com/report/submit?',
  bugReport: `${githubRepo}/issues/new?assignees=&labels=bug&projects=&template=bug_report.md&title=%5BBUG%5D`,
  featureRequest: `${githubRepo}/issues/new?assignees=&labels=enhancement&projects=&template=feature_request.md&title=%5BFEATURE%5D`,
  donate: 'https://ko-fi.com/leviwilkerson',
  termsOfUse: 'https://leviwilkerson.com/witness-work/terms',
  nwpublisherSubmitReport: 'https://nwpublisher.com/report/',
  crowdin: 'https://crowdin.com/project/jw-time',
  openRouterZdr: 'https://openrouter.ai/docs/guides/features/zdr',
}
