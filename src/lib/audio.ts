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

const SOUNDS = {
  successChime,
}

export type SoundName = keyof typeof SOUNDS

export const isAudioEnabled = () => usePreferences.getState().audioEnabled

export function useSound(name: SoundName) {
  const player = useAudioPlayer(SOUNDS[name])

  return () => {
    if (!isAudioEnabled()) return
    try {
      player.seekTo(0)
      player.play()
    } catch {}
  }
}

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
    } catch {}
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

export type RewardSoundRole = 'hit' | 'heavy' | 'slam' | 'tick' | 'land'

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

const effects = new Map<string, 'loading' | 'loaded' | 'failed'>()

const REWARD_POOL = 3
const rewardPools = new Map<string, { players: AudioPlayer[]; next: number }>()

const rewardKey = (
  set: Exclude<RewardSoundSet, 'off'>,
  role: RewardSoundRole
) => `${set}-${role}`

export function rewardSoundSet(): RewardSoundSet {
  return knownRewardSoundSet(usePreferences.getState().rewardSounds)
}

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

    if (soundEffectsAvailable() && !effects.has(key)) prepareRewardSounds(set)
    const pool = rewardPool(set, role)
    const player = pool.players[pool.next]
    pool.next = (pool.next + 1) % REWARD_POOL
    player.volume = volume
    player.setPlaybackRate(clamped)
    player.seekTo(0)
    player.play()
  } catch {}
}

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

      player.shouldCorrectPitch = false
      pool.players.push(player)
    }
    rewardPools.set(key, pool)
  }
  return pool
}

const PREVIEW_SLAM_MS = 280

export function previewRewardSounds(set: RewardSoundSet) {
  playRewardSound('hit', { set })
  setTimeout(() => playRewardSound('slam', { set }), PREVIEW_SLAM_MS)
}

export function prepareRewardSounds(set: RewardSoundSet = rewardSoundSet()) {
  if (!isAudioEnabled() || set === 'off') return
  const roles = Object.keys(REWARD_SOUNDS[set]) as RewardSoundRole[]
  if (soundEffectsAvailable()) {
    for (const role of roles) void loadRewardEffect(set, role)
    return
  }
  try {
    for (const role of roles) rewardPool(set, role)
  } catch {}
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
  } catch {}
  effects.set(key, loaded ? 'loaded' : 'failed')
}

export function releaseRewardSounds() {
  for (const { players } of rewardPools.values())
    for (const player of players) player.remove()
  rewardPools.clear()
}

export const semitones = (n: number) => 2 ** (n / 12)

const CUES = {
  scribeVoiceStart,
  scribeVoiceEnd,
}

export type CueName = keyof typeof CUES

const cueUris = new Map<CueName, string>()

export async function prepareCues(...names: CueName[]) {
  await Promise.all(
    names
      .filter((name) => !cueUris.has(name))
      .map(async (name) => {
        try {
          const asset = Asset.fromModule(CUES[name])
          await asset.downloadAsync()
          if (asset.localUri) cueUris.set(name, asset.localUri)
        } catch {}
      })
  )
}

export function playCue(name: CueName) {
  if (!isAudioEnabled()) return
  const uri = cueUris.get(name)
  if (!uri) return
  try {
    Speech.playCue(uri)
  } catch {}
}
