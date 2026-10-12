# Android menu icons

These 24dp vector drawables are converted from Google's [Material Icons](https://github.com/google/material-design-icons) SVGs under the included Apache-2.0 license. Each XML file records its source URL. Paths retain the original filled geometry; transparent SVG bounds are omitted and rectangles are converted to paths.

`src/components/ui/androidMenuIcons.ts` maps the SF Symbol names that `PullDownMenu` and `ContextMenu` callers supply to these files, which Metro bundles as assets for Compose `Icon`. To support another symbol, add a matching `ww_menu_*.xml` file here and map it there. No native rebuild is needed.

Unmapped symbols remain text-only on Android.
