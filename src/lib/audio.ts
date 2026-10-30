import { useEffect, useRef } from 'react'
import { createAudioPlayer, useAudioPlayer, type AudioPlayer } from 'expo-audio'
import { Asset } from 'expo-asset'
import * as Speech from '../../modules/speech-transcription'
import {
  loadSoundEffect,
  playSoundEffect,
  soundEffectsAvailable,
} from '../../modules/sound-effects'
import {
  knownRewardSoundSet,
  usePreferences,
  type RewardSoundSet,
} from '@/stores/preferences'
import successChime from '@/assets/audio/success-chime.mp3'
import scribeVoiceStart from '@/assets/audio/scribe-voice-start.wav'
import scribeVoiceEnd from '@/assets/audio/scribe-voice-end.wav'
import signatureHit from '@/assets/audio/reward/signature-hit.mp3'
import signatureHeavy from '@/assets/audio/reward/signature-heavy.mp3'
import signatureSlam from '@/assets/audio/reward/signature-slam.mp3'
import signatureTick from '@/assets/audio/reward/signature-tick.mp3'
import signatureLand from '@/assets/audio/reward/signature-land.mp3'
import classicHit from '@/assets/audio/reward/classic-hit.mp3'
import classicHeavy from '@/assets/audio/reward/classic-heavy.mp3'
import classicSlam from '@/assets/audio/reward/classic-slam.mp3'
import classicTick from '@/assets/audio/reward/classic-tick.mp3'
import classicLand from '@/assets/audio/reward/classic-land.mp3'
import clickHit from '@/assets/audio/reward/click-hit.mp3'
import clickHeavy from '@/assets/audio/reward/click-heavy.mp3'
import clickSlam from '@/assets/audio/reward/click-slam.mp3'
import clickTick from '@/assets/audio/reward/click-tick.mp3'
import clickLand from '@/assets/audio/reward/click-land.mp3'
import softHit from '@/assets/audio/reward/soft-hit.mp3'
import softHeavy from '@/assets/audio/reward/soft-heavy.mp3'
import softSlam from '@/assets/audio/reward/soft-slam.mp3'
import softTick from '@/assets/audio/reward/soft-tick.mp3'
import softLand from '@/assets/audio/reward/soft-land.mp3'
import woodHit from '@/assets/audio/reward/wood-hit.mp3'
import woodHeavy from '@/assets/audio/reward/wood-heavy.mp3'
import woodSlam from '@/assets/audio/reward/wood-slam.mp3'
import woodTick from '@/assets/audio/reward/wood-tick.mp3'
import woodLand from '@/assets/audio/reward/wood-land.mp3'
import analogHit from '@/assets/audio/reward/analog-hit.mp3'
import analogHeavy from '@/assets/audio/reward/analog-heavy.mp3'
import analogSlam from '@/assets/audio/reward/analog-slam.mp3'
import analogTick from '@/assets/audio/reward/analog-tick.mp3'
import analogLand from '@/assets/audio/reward/analog-land.mp3'
import thockHit from '@/assets/audio/reward/thock-hit.mp3'
import thockHeavy from '@/assets/audio/reward/thock-heavy.mp3'
import thockSlam from '@/assets/audio/reward/thock-slam.mp3'
import thockTick from '@/assets/audio/reward/thock-tick.mp3'
import thockLand from '@/assets/audio/reward/thock-land.mp3'

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

/**
 * Every reward sound by set (`src/assets/audio/reward`), made from Hex's
 * feedback sounds by `scripts/reward-sounds/generate.py`.
 */
const REWARD_SOUNDS: Record<
  Exclude<RewardSoundSet, 'off'>,
  Record<RewardSoundRole, number>
> = {
  signature: {
    hit: signatureHit,
    heavy: signatureHeavy,
    slam: signatureSlam,
    tick: signatureTick,
    land: signatureLand,
  },
  classic: {
    hit: classicHit,
    heavy: classicHeavy,
    slam: classicSlam,
    tick: classicTick,
    land: classicLand,
  },
  click: {
    hit: clickHit,
    heavy: clickHeavy,
    slam: clickSlam,
    tick: clickTick,
    land: clickLand,
  },
  soft: {
    hit: softHit,
    heavy: softHeavy,
    slam: softSlam,
    tick: softTick,
    land: softLand,
  },
  wood: {
    hit: woodHit,
    heavy: woodHeavy,
    slam: woodSlam,
    tick: woodTick,
    land: woodLand,
  },
  analog: {
    hit: analogHit,
    heavy: analogHeavy,
    slam: analogSlam,
    tick: analogTick,
    land: analogLand,
  },
  thock: {
    hit: thockHit,
    heavy: thockHeavy,
    slam: thockSlam,
    tick: thockTick,
    land: thockLand,
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

/**
 * The User's reward sounds, or none. A set this build doesn't have (from a
 * newer build, or one since retired) plays the default.
 */
export function rewardSoundSet(): RewardSoundSet {
  return knownRewardSoundSet(usePreferences.getState().rewardSounds)
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
