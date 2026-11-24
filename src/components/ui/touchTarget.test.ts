import { afterEach, describe, expect, it, vi } from 'vitest'

const platform = {
  OS: 'ios',
  select: (spec: Record<string, unknown>) => spec[platform.OS] ?? spec.default,
}
vi.mock('react-native', () => ({ Platform: platform }))

const load = async (os: string) => {
  platform.OS = os
  vi.resetModules()
  return import('@/components/ui/touchTarget')
}

afterEach(() => {
  platform.OS = 'ios'
})

describe('touchTargetFrame', () => {
  it('grows a 20pt glyph to 44pt on iOS without moving it', async () => {
    const { touchTargetFrame } = await load('ios')
    expect(touchTargetFrame(20)).toMatchObject({
      width: 44,
      height: 44,
      marginHorizontal: -12,
      marginVertical: -12,
    })
  })

  it('grows to 48dp on Android', async () => {
    const { MIN_TOUCH_TARGET, touchTargetFrame } = await load('android')
    expect(MIN_TOUCH_TARGET).toBe(48)
    expect(touchTargetFrame(20)).toMatchObject({
      width: 48,
      height: 48,
      marginHorizontal: -14,
      marginVertical: -14,
    })
  })

  it('leaves a side that is already big enough alone', async () => {
    const { touchTargetFrame } = await load('ios')
    expect(touchTargetFrame(60, 30)).toMatchObject({
      width: 60,
      height: 44,
      marginHorizontal: 0,
      marginVertical: -7,
    })
  })
})

describe('webTextTargetFrame', () => {
  it('centers text with balanced horizontal padding and matching negative edge margin on web', async () => {
    const { webTextTargetFrame } = await load('web')
    expect(webTextTargetFrame('end')).toMatchObject({
      minWidth: 44,
      minHeight: 44,
      paddingHorizontal: 10,
      marginRight: -10,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    })
    expect(webTextTargetFrame('start')).toMatchObject({
      paddingHorizontal: 10,
      marginLeft: -10,
      alignItems: 'center',
    })
  })

  it('returns an empty style on native platforms', async () => {
    const { webTextTargetFrame } = await load('ios')
    expect(webTextTargetFrame('end')).toEqual({})
  })
})
