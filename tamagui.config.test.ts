import { describe, expect, it } from 'vitest'
import { config } from '@tamagui/config/v3'
import tamaguiConfig from './tamagui.config'

describe('tamagui config', () => {
  const names = Object.keys(tamaguiConfig.themes)

  it('keeps light, dark and their component themes', () => {
    const componentThemes = Object.keys(config.themes).filter((name) =>
      /^(light|dark)_[A-Z]/.test(name)
    )
    expect(componentThemes).toContain('light_Input')
    expect(componentThemes).toContain('dark_TextArea')
    expect(names.sort()).toEqual(['dark', 'light', ...componentThemes].sort())
  })

  it('drops colour and level sub-themes', () => {
    for (const name of ['light_blue', 'dark_alt1', 'light_blue_Button']) {
      expect(Object.keys(config.themes)).toContain(name)
      expect(names).not.toContain(name)
    }
  })
})
