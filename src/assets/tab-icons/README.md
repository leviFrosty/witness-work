# Android tab bar icons

Android's native tab bar loads its icons as bitmaps, so these PNGs are rendered from Google's [Material Symbols](https://github.com/google/material-design-icons) (Outlined, 24px) under the included Apache-2.0 license. iOS uses SF Symbols instead.

| File                | Material Symbol          |
| ------------------- | ------------------------ |
| `home`              | `home`                   |
| `home_selected`     | `home`, filled           |
| `contacts`          | `contacts`               |
| `contacts_selected` | `contacts`, filled       |
| `progress`          | `monitoring`             |
| `schedule`          | `calendar_month`         |
| `schedule_selected` | `calendar_month`, filled |
| `add`               | `add_circle`, filled     |

The SVGs in `svg/` are the sources, from `symbols/web/<name>/materialsymbolsoutlined/<name>_24px.svg` (or `_fill1_24px.svg` for filled). To change an icon, replace its SVG and run `node scripts/generate-tab-icons.mjs`.
