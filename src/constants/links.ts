import * as Application from 'expo-application'

const itunesItemId = 6469723047

export default {
  privacyPolicy:
    'https://www.privacypolicies.com/live/e8582dba-e429-4c6a-8347-8b93e3a4867d',
  appStoreReview: `itms-apps://itunes.apple.com/app/viewContentsUserReviews/id${itunesItemId}?action=write-review`,
  playStoreReview: `market://details?id=${Application.applicationId}&showAllReviews=true`,
  githubRepo: 'https://github.com/leviFrosty/JW-Time',
  appleMapsBase: 'http://maps.apple.com/?q=',
  googleMapsBase: 'https://www.google.com/maps/search/?api=1&query=',
  wazeMapsBase: 'https://waze.com/ul?q=',
}
