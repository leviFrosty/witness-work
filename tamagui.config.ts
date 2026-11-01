import { config } from '@tamagui/config/v3'

import { createTamagui } from 'tamagui'

type V3Themes = typeof config.themes
type Scheme = 'light' | 'dark'

type UsedThemeName = Extract<
  keyof V3Themes,
  Scheme | `${Scheme}_${Capitalize<string>}`
>

const themes = Object.fromEntries(
  Object.entries(config.themes).filter(([name]) =>
    /^(light|dark)(_[A-Z][A-Za-z]*)?$/.test(name)
  )
) as Pick<V3Themes, UsedThemeName>

const tamaguiConfig = createTamagui({ ...config, themes })

type Conf = typeof tamaguiConfig

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}
export default tamaguiConfig
