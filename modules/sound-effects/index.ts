import { requireOptionalNativeModule } from 'expo-modules-core'

interface SoundEffectsNative {
  soundEffectsVersion?: number

  load(key: string, uri: string): Promise<boolean>

  play(key: string, rate: number, volume: number): void
}

const native = requireOptionalNativeModule<SoundEffectsNative>('SoundEffects')

export const soundEffectsAvailable = () => native !== null

export const loadSoundEffect = (key: string, uri: string) =>
  native ? native.load(key, uri) : Promise.resolve(false)

export const playSoundEffect = (key: string, rate: number, volume: number) =>
  native?.play(key, rate, volume)
