import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/stores/mmkv', () => import('@/__tests__/mocks/mmkv'))
vi.mock('expo-constants', () => ({
  default: { expoConfig: { version: '1.0.0' } },
}))
vi.mock('expo-device', () => ({
  DeviceType: { TABLET: 2 },
  deviceType: 1,
  osName: 'iOS',
}))
vi.mock('@/lib/locales', () => ({
  default: { t: (key: string) => key },
}))

const player = vi.hoisted(() => ({ seekTo: vi.fn(), play: vi.fn() }))
vi.mock('expo-audio', () => ({ useAudioPlayer: () => player }))
vi.mock('@/assets/audio/success-chime.mp3', () => ({ default: 1 }))

import { useSound } from '@/lib/audio'
import { MmkvStorage } from '@/stores/mmkv'
import {
  NON_SYNCABLE_PREFERENCE_KEYS,
  PREFERENCE_DEFAULTS,
  usePreferences,
} from '@/stores/preferences'

describe('Audio setting', () => {
  beforeEach(() => {
    player.seekTo.mockClear()
    player.play.mockClear()
    usePreferences.getState().set({ audioEnabled: true })
  })

  it('is on by default', () => {
    expect(PREFERENCE_DEFAULTS.audioEnabled).toBe(true)
  })

  it('turns on for existing installs whose saved preferences predate it', async () => {
    vi.spyOn(MmkvStorage, 'getItem').mockReturnValueOnce(
      JSON.stringify({ state: { onboardingComplete: true }, version: 7 })
    )
    usePreferences.setState(usePreferences.getInitialState(), true)

    await usePreferences.persist.rehydrate()

    expect(usePreferences.getState().onboardingComplete).toBe(true)
    expect(usePreferences.getState().audioEnabled).toBe(true)
  })

  it('plays sounds when on', () => {
    useSound('successChime')()

    expect(player.seekTo).toHaveBeenCalledWith(0)
    expect(player.play).toHaveBeenCalledOnce()
  })

  it('stays silent when the User turns audio off', () => {
    const play = useSound('successChime')
    usePreferences.getState().set({ audioEnabled: false })

    play()

    expect(player.play).not.toHaveBeenCalled()
  })

  it('stays on this device instead of syncing', () => {
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('audioEnabled')).toBe(true)
  })
})
