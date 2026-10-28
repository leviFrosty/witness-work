import { useEffect, useRef } from 'react'
import { createAudioPlayer, useAudioPlayer, type AudioPlayer } from 'expo-audio'
import { Asset } from 'expo-asset'
import * as Speech from '../../modules/speech-transcription'
import {
  loadSoundEffect,
  playSoundEffect,
  soundEffectsAvailable,
} from '../../modules/sound-effects'
import { usePreferences, type RewardSoundSet } from '@/stores/preferences'
import successChime from '@/assets/audio/success-chime.mp3'
import scribeVoiceStart from '@/assets/audio/scribe-voice-start.wav'
import scribeVoiceEnd from '@/assets/audio/scribe-voice-end.wav'
import punchHit from '@/assets/audio/reward/punch-hit.mp3'
import punchHeavy from '@/assets/audio/reward/punch-heavy.mp3'
import punchSlam from '@/assets/audio/reward/punch-slam.mp3'
import punchTick from '@/assets/audio/reward/punch-tick.mp3'
import punchLand from '@/assets/audio/reward/punch-land.mp3'
import retroHit from '@/assets/audio/reward/retro-hit.mp3'
import retroHeavy from '@/assets/audio/reward/retro-heavy.mp3'
import retroSlam from '@/assets/audio/reward/retro-slam.mp3'
import retroTick from '@/assets/audio/reward/retro-tick.mp3'
import retroLand from '@/assets/audio/reward/retro-land.mp3'
import softHit from '@/assets/audio/reward/soft-hit.mp3'
import softHeavy from '@/assets/audio/reward/soft-heavy.mp3'
import softSlam from '@/assets/audio/reward/soft-slam.mp3'
import softTick from '@/assets/audio/reward/soft-tick.mp3'
import softLand from '@/assets/audio/reward/soft-land.mp3'

/**
 * Every sound the app can play. Callers reference sounds by name so the asset
 * behind a name can change (or become user-selectable) without touching them.
 */
const SOUNDS = {
  successChime,
}

export type SoundName = keyof typeof SOUNDS

/**
 * Whether in-app sounds may play on this device. Read at play time rather than
 * subscribed to, so toggling the setting applies to the next sound without
 * re-rendering every player.
 */
export const isAudioEnabled = () => usePreferences.getState().audioEnabled

/**
 * Preloads `name` and returns a function that plays it from the start. This and
 * `expo-audio` itself are only imported here (lint-enforced) so the Audio &
 * Haptics setting can't be bypassed.
 */
export function useSound(name: SoundName) {
  const player = useAudioPlayer(SOUNDS[name])

  return () => {
    if (!isAudioEnabled()) return
    try {
      // No setAudioModeAsync here: the default audio mode keeps the iOS
      // session in the ambient category, so sounds respect the device's
      // ring/silent switch (#365). Don't re-add `playsInSilentMode: true` —
      // it flips the session to `.playback`, which bypasses the mute switch.
      player.seekTo(0)
      player.play()
    } catch {
      // Silently fail if playback cannot start
    }
  }
}

/**
 * Like `useSound`, but creates the player the first time it plays instead of on
 * mount. For players mounted at launch that rarely play.
 */
export function useLazySound(name: SoundName) {
  const playerRef = useRef<AudioPlayer | null>(null)
  useEffect(
    () => () => {
      playerRef.current?.remove()
      playerRef.current = null
    },
    []
  )

  return () => {
    if (!isAudioEnabled()) return
    try {
      playFromStart(playerRef, name)
    } catch {
      // Silently fail if playback cannot start
    }
  }
}

const playFromStart = (
  playerRef: { current: AudioPlayer | null },
  name: SoundName
) => {
  if (!playerRef.current) playerRef.current = createAudioPlayer(SOUNDS[name])
  playerRef.current.seekTo(0)
  playerRef.current.play()
}

/**
 * What a reward plays: each hit, a milestone's heavier one, the total's slam,
 * each tick of the count, and the ding it lands on.
 */
export type RewardSoundRole = 'hit' | 'heavy' | 'slam' | 'tick' | 'land'

/** Every reward sound by set (`src/assets/audio/reward`, all CC0). */
const REWARD_SOUNDS: Record<
  Exclude<RewardSoundSet, 'off'>,
  Record<RewardSoundRole, number>
> = {
  punch: {
    hit: punchHit,
    heavy: punchHeavy,
    slam: punchSlam,
    tick: punchTick,
    land: punchLand,
  },
  retro: {
    hit: retroHit,
    heavy: retroHeavy,
    slam: retroSlam,
    tick: retroTick,
    land: retroLand,
  },
  soft: {
    hit: softHit,
    heavy: softHeavy,
    slam: softSlam,
    tick: softTick,
    land: softLand,
  },
}

/**
 * Reward sounds play through `modules/sound-effects`: decoded into memory once
 * and started at once, so each lands on the hit it's timed to. Binaries from
 * before it play through expo-audio, which starts each sound 50–100 ms late.
 */
const effects = new Map<string, 'loading' | 'loaded' | 'failed'>()

/** Fallback players per reward sound, so quick hits overlap. */
const REWARD_POOL = 3
const rewardPools = new Map<string, { players: AudioPlayer[]; next: number }>()

const rewardKey = (
  set: Exclude<RewardSoundSet, 'off'>,
  role: RewardSoundRole
) => `${set}-${role}`

/** The User's reward sounds, or none: a set from a newer build plays Punch. */
export function rewardSoundSet(): RewardSoundSet {
  const set = usePreferences.getState().rewardSounds
  return set === 'off' || set in REWARD_SOUNDS ? set : 'punch'
}

/**
 * Plays a reward sound from `set` (the User's by default). `rate` speeds it up
 * and raises its pitch with it (1.5 semitones a hit, `semitones`), so a combo
 * climbs. Silent with sounds off.
 */
export function playRewardSound(
  role: RewardSoundRole,
  {
    rate = 1,
    volume = 1,
    set = rewardSoundSet(),
  }: { rate?: number; volume?: number; set?: RewardSoundSet } = {}
) {
  if (!isAudioEnabled() || set === 'off') return
  try {
    const key = rewardKey(set, role)
    const clamped = Math.min(2, Math.max(0.5, rate))
    if (effects.get(key) === 'loaded')
      return playSoundEffect(key, clamped, volume)
    // Not loaded yet: this one plays late, the next on time.
    if (soundEffectsAvailable() && !effects.has(key)) prepareRewardSounds(set)
    const pool = rewardPool(set, role)
    const player = pool.players[pool.next]
    pool.next = (pool.next + 1) % REWARD_POOL
    player.volume = volume
    player.setPlaybackRate(clamped)
    player.seekTo(0)
    player.play()
  } catch {
    // Silently fail if playback cannot start
  }
}

/** The fallback players for one reward sound, created all at once. */
function rewardPool(
  set: Exclude<RewardSoundSet, 'off'>,
  role: RewardSoundRole
) {
  const key = rewardKey(set, role)
  let pool = rewardPools.get(key)
  if (!pool) {
    pool = { players: [], next: 0 }
    for (let i = 0; i < REWARD_POOL; i++) {
      const player = createAudioPlayer(REWARD_SOUNDS[set][role])
      // Speeding up raises the pitch too, like a tape.
      player.shouldCorrectPitch = false
      pool.players.push(player)
    }
    rewardPools.set(key, pool)
  }
  return pool
}

/** Between a sound set's hit and its slam, when it's previewed. */
const PREVIEW_SLAM_MS = 280

/** Plays `set`'s hit, then its slam: what picking a sound set sounds like. */
export function previewRewardSounds(set: RewardSoundSet) {
  playRewardSound('hit', { set })
  setTimeout(() => playRewardSound('slam', { set }), PREVIEW_SLAM_MS)
}

/** Loads every sound of `set`, so its first hit isn't late. */
export function prepareRewardSounds(set: RewardSoundSet = rewardSoundSet()) {
  if (!isAudioEnabled() || set === 'off') return
  const roles = Object.keys(REWARD_SOUNDS[set]) as RewardSoundRole[]
  if (soundEffectsAvailable()) {
    for (const role of roles) void loadRewardEffect(set, role)
    return
  }
  try {
    for (const role of roles) rewardPool(set, role)
  } catch {
    // Silently fail; they load on first play instead
  }
}

async function loadRewardEffect(
  set: Exclude<RewardSoundSet, 'off'>,
  role: RewardSoundRole
) {
  const key = rewardKey(set, role)
  if (effects.has(key)) return
  effects.set(key, 'loading')
  let loaded = false
  try {
    const asset = Asset.fromModule(REWARD_SOUNDS[set][role])
    await asset.downloadAsync()
    loaded = !!asset.localUri && (await loadSoundEffect(key, asset.localUri))
  } catch {
    // Plays through expo-audio instead
  }
  effects.set(key, loaded ? 'loaded' : 'failed')
}

/**
 * Lets the fallback players go, a while after the last reward. Loaded sounds
 * stay (a few hundred KB a set) so the next reward's first hit is on time; the
 * native player stops its engine on its own once quiet.
 */
export function releaseRewardSounds() {
  for (const { players } of rewardPools.values())
    for (const player of players) player.remove()
  rewardPools.clear()
}

/** A playback rate `semitones` higher. */
export const semitones = (n: number) => 2 ** (n / 12)

/**
 * Cues around recording. While the microphone is live iOS mutes app players,
 * and an app player stopping would deactivate the session under it, so these
 * play natively as system sounds (silent switch and ringer mode respected).
 * Generated by `scripts/generate-voice-cues.mjs`.
 */
const CUES = {
  scribeVoiceStart,
  scribeVoiceEnd,
}

export type CueName = keyof typeof CUES

const cueUris = new Map<CueName, string>()

/** Copies `names` to local files so `playCue` can start them without a wait. */
export async function prepareCues(...names: CueName[]) {
  await Promise.all(
    names
      .filter((name) => !cueUris.has(name))
      .map(async (name) => {
        try {
          const asset = Asset.fromModule(CUES[name])
          await asset.downloadAsync()
          if (asset.localUri) cueUris.set(name, asset.localUri)
        } catch {
          // A cue that can't load stays silent
        }
      })
  )
}

/** Plays a prepared cue; silent when unprepared or sounds are off. */
export function playCue(name: CueName) {
  if (!isAudioEnabled()) return
  const uri = cueUris.get(name)
  if (!uri) return
  try {
    Speech.playCue(uri)
  } catch {
    // Silently fail if playback cannot start
  }
}
