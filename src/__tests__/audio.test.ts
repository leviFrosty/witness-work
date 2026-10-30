import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' } }))
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

const player = vi.hoisted(() => ({
  seekTo: vi.fn(),
  play: vi.fn(),
  setPlaybackRate: vi.fn(),
  remove: vi.fn(),
}))
vi.mock('expo-audio', () => ({
  useAudioPlayer: () => player,
  createAudioPlayer: () => player,
}))
vi.mock('@/assets/audio/success-chime.mp3', () => ({ default: 1 }))
vi.mock('@/assets/audio/scribe-voice-start.wav', () => ({ default: 2 }))
vi.mock('@/assets/audio/scribe-voice-end.wav', () => ({ default: 3 }))
vi.mock('expo-asset', () => ({
  Asset: {
    fromModule: (id: number) => ({
      localUri: `file:///cues/${id}.wav`,
      downloadAsync: async () => {},
    }),
  },
}))
const gesture = vi.hoisted(() => ({ active: true }))
vi.mock('@/lib/userGesture', () => ({ hasUserGesture: () => gesture.active }))
const speech = vi.hoisted(() => ({ playCue: vi.fn() }))
vi.mock('../../modules/speech-transcription', () => speech)
const effects = vi.hoisted(() => ({
  available: true,
  soundEffectsAvailable: () => effects.available,
  loadSoundEffect: vi.fn(async () => true),
  playSoundEffect: vi.fn(),
}))
vi.mock('../../modules/sound-effects', () => effects)
vi.mock('@/assets/audio/reward/punch-hit.mp3', () => ({ default: 10 }))

import {
  playCue,
  playRewardSound,
  prepareCues,
  prepareRewardSounds,
  releaseRewardSounds,
  useSound,
} from '@/lib/audio'
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
    speech.playCue.mockClear()
    effects.loadSoundEffect.mockClear()
    effects.playSoundEffect.mockClear()
    gesture.active = true
    usePreferences.getState().set({ audioEnabled: true })
  })

  it('is on by default', () => {
    expect(PREFERENCE_DEFAULTS.audioEnabled).toBe(true)
  })

  it('is off by default in dev builds', async () => {
    vi.resetModules()
    vi.stubGlobal('__DEV__', true)
    try {
      const { PREFERENCE_DEFAULTS: devDefaults } = await import(
        '@/stores/preferences'
      )
      expect(devDefaults.audioEnabled).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
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

  it('plays a prepared cue natively from its local file', async () => {
    await prepareCues('scribeVoiceStart')

    playCue('scribeVoiceStart')

    expect(speech.playCue).toHaveBeenCalledWith('file:///cues/2.wav')
  })

  it('keeps cues silent when the User turns audio off', async () => {
    await prepareCues('scribeVoiceEnd')
    usePreferences.getState().set({ audioEnabled: false })

    playCue('scribeVoiceEnd')

    expect(speech.playCue).not.toHaveBeenCalled()
  })

  it('plays loaded reward sounds natively, at their rate', async () => {
    prepareRewardSounds('punch')
    await vi.waitFor(() =>
      expect(effects.loadSoundEffect).toHaveBeenCalledWith(
        'punch-hit',
        'file:///cues/10.wav'
      )
    )
    await Promise.resolve()

    playRewardSound('hit', { set: 'punch', rate: 3, volume: 0.6 })

    expect(effects.playSoundEffect).toHaveBeenCalledWith('punch-hit', 2, 0.6)
    expect(player.play).not.toHaveBeenCalled()
  })

  it('plays reward sounds through expo-audio on binaries without the module', () => {
    releaseRewardSounds()
    effects.available = false
    try {
      playRewardSound('hit', { set: 'retro' })

      expect(effects.playSoundEffect).not.toHaveBeenCalled()
      expect(player.play).toHaveBeenCalledOnce()
    } finally {
      effects.available = true
    }
  })

  it('keeps reward sounds silent when the User turns audio off', () => {
    usePreferences.getState().set({ audioEnabled: false })

    playRewardSound('hit', { set: 'punch' })

    expect(effects.playSoundEffect).not.toHaveBeenCalled()
    expect(player.play).not.toHaveBeenCalled()
  })

  it('stays on this device instead of syncing', () => {
    expect(NON_SYNCABLE_PREFERENCE_KEYS.has('audioEnabled')).toBe(true)
  })
})

// Last: playing a sound that isn't loaded yet starts loading it for the rest.
describe('Audio on a page without a tap yet', () => {
  beforeEach(() => {
    player.play.mockClear()
    effects.playSoundEffect.mockClear()
    usePreferences.getState().set({ audioEnabled: true })
  })

  it("waits for the page's first tap before playing, as a browser does", () => {
    gesture.active = false
    playRewardSound('hit')
    expect(effects.playSoundEffect).not.toHaveBeenCalled()
    expect(player.play).not.toHaveBeenCalled()

    gesture.active = true
    playRewardSound('hit')
    expect(
      player.play.mock.calls.length + effects.playSoundEffect.mock.calls.length
    ).toBe(1)
  })
})
