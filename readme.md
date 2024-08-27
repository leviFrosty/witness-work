### JW Time was rebranded to WitnessWork in August 2024.

![Expo](https://img.shields.io/badge/expo-1C1E24?style=flat&logo=expo&logoColor=#D04A37)
![Release Version](https://img.shields.io/github/v/release/leviFrosty/witness-work)
![Issues](https://img.shields.io/github/issues/leviFrosty/witness-work)
[![Crowdin](https://badges.crowdin.net/jw-time/localized.svg)](https://crowdin.com/project/jw-time)

# WitnessWork

WitnessWork is the easy way for Jehovah's Witnesses to manage their field service priorities.

It is written in Typescript using React Native and Expo.

## View it live

[![App Store](https://img.shields.io/badge/App_Store-0D96F6?style=for-the-badge&logo=app-store&logoColor=white)](https://apps.apple.com/us/app/jw-time/id6469723047)
[![Play Store](https://img.shields.io/badge/Google_Play-414141?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.leviwilkerson.witnesswork)

<div float="left">
<img src="./src/docs/screenshots/preview1.jpg" width="130">
<img src="./src/docs/screenshots/preview2.jpg" width="130">
<img src="./src/docs/screenshots/preview3.jpg" width="130">
<img src="./src/docs/screenshots/preview4.jpg" width="130">
<img src="./src/docs/screenshots/preview5.jpg" width="130">
<img src="./src/docs/screenshots/preview6.jpg" width="130">
</div>

# Build

Building Android & iOS is similar, for this example we will build an iOS simulator.

Build dependencies: [XCode](https://docs.expo.dev/workflow/ios-simulator/#install-xcode), XCode latest iOS version, [XCode cli](https://docs.expo.dev/workflow/ios-simulator/#install-xcode-command-line-tools), [Watchman](https://facebook.github.io/watchman/docs/install#macos), [Fastlane](https://docs.fastlane.tools/), [Node](https://nodejs.org/en/download/package-manager), [Yarn](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable), and [EAS cli](https://docs.expo.dev/eas-update/getting-started/)

1. Clone repository

1. Switch to workspace node version, `nvm use`

1. Install dependencies, `yarn install`

1. Build iOS, run `eas build -p ios --profile development-simulator --local`

1. Install new build to simulator, (replace path) `eas build:run -p ios --path [path].tar.gz`

1. Run development server, `yarn run dev`

1. Develop 🚀

Learn about the [file and project structure](./src/docs/project-structure.md).

# Help Translate 🌐

WitnessWork is available in 13 languages. Some of these translations are done by AI, which may not be of the highest quality. To help, proofread these translations on [Crowdin](https://crowdin.com/project/jw-time/). Thank you!

[Not sure how to use Crowdin?](https://support.crowdin.com/crowdin-intro/)

# License

WitnessWork © 2024 by Levi Wilkerson is licensed under [Attribution-NonCommercial 4.0 International](./LICENSE)

# Sponsor

Sponsors & Donations are never expected but greatly appreciated.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/leviwilkerson)
