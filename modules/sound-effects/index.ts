import { requireOptionalNativeModule } from 'expo-modules-core'

interface SoundEffectsNative {
  soundEffectsVersion?: number
  /** Decodes the local file at `uri` into memory as `key`; false if it can't. */
  load(key: string, uri: string): Promise<boolean>
  /** Plays a loaded `key` now; nothing when it isn't loaded. */
  play(key: string, rate: number, volume: number): void
}

const native = requireOptionalNativeModule<SoundEffectsNative>('SoundEffects')

/**
 * Whether this binary can play low-latency sound effects. OTA updates can run
 * against older binaries without the module, which play through expo-audio.
 */
export const soundEffectsAvailable = () => native !== null

export const loadSoundEffect = (key: string, uri: string) =>
  native ? native.load(key, uri) : Promise.resolve(false)

export const playSoundEffect = (key: string, rate: number, volume: number) =>
  native?.play(key, rate, volume)
