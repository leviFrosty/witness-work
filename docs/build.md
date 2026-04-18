# Build

Ensure you have all dependencies installed.

## iOS

Build dependencies: [XCode](https://docs.expo.dev/workflow/ios-simulator/#install-xcode), XCode latest iOS version, [XCode cli](https://docs.expo.dev/workflow/ios-simulator/#install-xcode-command-line-tools), [Watchman](https://facebook.github.io/watchman/docs/install#macos), [Fastlane](https://docs.fastlane.tools/), [Cocoapods](https://cocoapods.org/), [Node](https://nodejs.org/en/download/package-manager), [pnpm](https://pnpm.io/), and [EAS cli](https://docs.expo.dev/eas-update/getting-started/)

1. Clone repository

1. Switch to workspace node version, `nvm use`

1. Install dependencies, `pnpm install`

1. Build iOS, run `pnpm run build`

1. Install new build to simulator, (replace path) `eas build:run -p ios --path [path].tar.gz`

1. Run development server, `pnpm run ios`

1. Develop 🚀
