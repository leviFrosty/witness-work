# Project Structure

- [`.github`](/.github) Configuration files for Github actions.
- [`.husky`](/.husky) Configuration files for [husky](https://typicode.github.io/husky/), a git hooks library.
- [`.tamagui`](/.tamagui) Configuration files for [tamagui](https://tamagui.dev/), a component library used in only portions of the project.
- [`.vscode`](/.vscode) VSCode configuration files for extensions.
- [`App.tsx`](/App.tsx) Application entry point.
- [**`src`**](/src) This is where all of the project source code lives.

  - [`__tests__`](/src/__tests__) Where all of the tests for the project lives.
  - [`assets`](/src/assets) Where local assets such a images, icons, and [lottie](https://lottiefiles.com/) animations are stored.
  - [`components`](/src/components) All of the components of the project.
  - [`constants`](/src/constants) Variables that are constant throughout the app and do not change.
  - [`contexts`](/src/contexts) Stores the internal [React Contexts](https://react.dev/learn/passing-data-deeply-with-context).
  - [`docs`](/src/docs) The documentation and related assets for this repository.
  - [`hooks`](/src/hooks) Contains the custom [React Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks#hook-names-always-start-with-use) for this project.
  - [`lib`](/src/lib) Contains many functions that are useful for app functionality. Generally, shared functions should come from a `lib` instead of directly from a `component`.
  - [`locales`](/src/locales) The translations files for each locale - `en` is the master.
  - [`providers`](/src/providers) The [React Providers](https://react.dev/reference/react/createContext#provider) for the [`contexts`](/src/contexts).
  - [`screens`](/src/screens) Contains all [screens](https://reactnative.dev/docs/navigation) that the app can display.
  - [`scripts`](/src/scripts) Local CLI scripts for various CI/CD functions.
  - [`stacks`](/src/stacks) All [native stacks](https://reactnavigation.org/docs/native-stack-navigator) of used for [React Native Navigation](https://reactnavigation.org/).
  - [`stores`](/src/stores) The [MMKV](https://github.com/mrousavy/react-native-mmkv) stores and legacy [AsyncStorage](https://github.com/react-native-async-storage/async-storage) APIs for CRUD operations of app data using the device's storage.
  - [`types`](/src/types) Shared type definitions.
