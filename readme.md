![Expo](https://img.shields.io/badge/expo-1C1E24?style=flat&logo=expo&logoColor=#D04A37)
![Release Version](https://img.shields.io/github/package-json/v/leviFrosty/JW-Time/production?label=Release%20Version&color=%231BD15D)
![Issues](https://img.shields.io/github/issues/leviFrosty/JW-Time)
[![Crowdin](https://badges.crowdin.net/jw-time/localized.svg)](https://crowdin.com/project/jw-time)

# JW Time

JW Time is the easy way for Jehovah's Witnesses to manage their field service priorities.

## View it live

[![App Store](https://img.shields.io/badge/App_Store-0D96F6?style=for-the-badge&logo=app-store&logoColor=white)](https://apps.apple.com/us/app/jw-time/id6469723047)
[![Play Store](https://img.shields.io/badge/Google_Play-414141?style=for-the-badge&logo=google-play&logoColor=white)](https://play.google.com/store/apps/details?id=com.leviwilkerson.jwtime)

### Preview

<div float="left">
<img src="./src/docs/screenshots/preview1.png" width="150">
<img src="./src/docs/screenshots/preview2.png" width="150">
<img src="./src/docs/screenshots/preview3.png" width="150">
<img src="./src/docs/screenshots/preview4.png" width="150">
<img src="./src/docs/screenshots/preview5.png" width="150">
<img src="./src/docs/screenshots/preview6.png" width="150">
</div>

## Want to Contribute?

### Help Financially 💖

Donations are never expected but greatly appreciated! These donations are used to offset the costs of:

- [App Store Fees](https://developer.apple.com/support/compare-memberships/#:~:text=**%20The%20Apple%20Developer%20Program%20is%2099%20USD%20per%20membership%20year%20or%20in%20local%20currency%20where%20available.%20Your%20nonprofit%2C%20educational%20institution%2C%20or%20government%20entity%20may%20be%20eligible%20for%20a%20fee%20waiver.) ($100/yr)
- [Here API Calls](https://www.here.com/platform/geocoding) (Currently $0/mo)
- [Google Cloud Translation](https://cloud.google.com/translate/pricing) (<$5/mo)

These expenses are kept up to date here. Thank you!

### Help Translate 🌐

JW Time is automatically translated into 12 languages by means of Google Cloud Translate. These translations might not always be the highest quality. To help, proofread these translations on [Crowdin](https://crowdin.com/project/jw-time/). Thank you!

[Not sure how to use Crowdin?](https://support.crowdin.com/crowdin-intro/)

Current translations: de, es, fr, it, ja, ko, nl, pt, ru, vi, zh, tl

### Help Code ⌨️

Any assistance is welcome! Look at the following and see if anything looks interesting to you:

1. [Open issues](https://github.com/leviFrosty/JW-Time/issues)
2. [Project board](https://github.com/users/leviFrosty/projects/2)

If you find something you'd like to help with, please let me know you've began work on it so it doesn't become double-worked. Thank you!

#### Project Structure

- [`.github`](/.github) Configuration files for Github actions.
- [`.husky`](/.husky) Configuration files for [husky](https://typicode.github.io/husky/), a git hooks library.
- [`.tamagui`](/.tamagui) Configuration files for [tamagui](https://tamagui.dev/), a component library used in only portions of the project.
- [`.vscode`](/.vscode) VSCode configuration files for extensions.

- [**`src`**](/src) This is where all of the project source code lives.

  - [`__tests__`](/src/__tests__) Where all of the tests for the project lives.
  - [`assets`](/src/assets) Where local assets such a images, icons, and [lottie](https://lottiefiles.com/) animations are stored.
  - [`components`](/src/components) All of the components of the project.
  - [`constants`](/src/constants) Variables that are constant throughout the app and do not change.
  - [`contexts`](/src/contexts) Stores the [React Contexts](https://react.dev/learn/passing-data-deeply-with-context) that do not come from external dependencies.
  - [`docs`](/src/docs) The documentation for this repository.
  - [`hooks`](/src/hooks) Contains the custom [React Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks#hook-names-always-start-with-use) for this project.
  - [`lib`](/src/lib) Contains many functions that are useful for app functionality. Generally, shared functions should come from a `lib` instead of directly from a `component`.
  - [`locales`](/src/locales) The translations files for each locale - `en` is the master.
  - [`providers`](/src/providers) The [React Providers](https://react.dev/reference/react/createContext#provider) for the [`contexts`](/src/contexts).
  - [`screens`](/src/screens) Contains all [screens](https://reactnative.dev/docs/navigation) that the app can display.
  - [`scripts`](/src/scripts) Local CLI scripts for various CI/CD functions.
  - [`stacks`](/src/stacks) All [native stacks](https://reactnavigation.org/docs/native-stack-navigator) of used for [React Native Navigation](https://reactnavigation.org/).
  - [`stores`](/src/stores) The [AsyncStorage](https://github.com/react-native-async-storage/async-storage) APIs for all app data.
  - [`types`](/src/types) Type definitions.

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/leviwilkerson)

## License

JW Time © 2023 by Levi Wilkerson is licensed under [Attribution-NonCommercial 4.0 International](./LICENSE)
