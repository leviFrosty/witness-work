# Android pull-down menu icons

These 24dp vector drawables are converted from Google's [Material Icons](https://github.com/google/material-design-icons) SVGs under the included Apache-2.0 license. Each XML file records its source URL. Paths retain the original filled geometry; transparent SVG bounds are omitted and rectangles are converted to paths.

`symbols.json` maps the SF Symbol names supplied by `PullDownMenu` callers to Android resource names. To support another symbol, add its mapping and a matching `ww_menu_*.xml` file here, then prebuild and rebuild Android. The `with-android-menu-icons` Expo plugin copies these files into the generated native project and keeps them from resource shrinking, since `MenuView` resolves their names at runtime.

Unmapped symbols remain text-only on Android. Long-press `ContextMenu` uses a separate Compose renderer and does not consume these drawables.

The package patch in `patches/@react-native-menu__menu@2.0.0.patch` switches the native popup to AndroidX and forces icon visibility on all supported Android versions, removing the library's Android 10 restriction.
