import { config } from '@tamagui/config/v3'

import { createTamagui } from 'tamagui'

type V3Themes = typeof config.themes
type Scheme = 'light' | 'dark'
/** `light`, `dark` and their component themes, such as `light_Input`. */
type UsedThemeName = Extract<
  keyof V3Themes,
  Scheme | `${Scheme}_${Capitalize<string>}`
>

/**
 * Tamagui only draws a few primitives here (Input, TextArea, Spinner, XStack,
 * Portal), always in the base light or dark theme: the app's own ThemeProvider
 * styles everything else, and nothing sets a Tamagui `theme`. The v3 config
 * ships 900 themes (colours, alt and surface levels, and each one's component
 * themes), and `createTamagui` expands every one of them before the first
 * screen. Keep the ones those primitives can resolve.
 */
const themes = Object.fromEntries(
  Object.entries(config.themes).filter(([name]) =>
    /^(light|dark)(_[A-Z][A-Za-z]*)?$/.test(name)
  )
) as Pick<V3Themes, UsedThemeName>

const tamaguiConfig = createTamagui({ ...config, themes })
// this makes typescript properly type everything based on the config

type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
export default tamaguiConfig
// depending on if you chose tamagui, @tamagui/core, or @tamagui/web
// be sure the import and declare module lines both use that same name
