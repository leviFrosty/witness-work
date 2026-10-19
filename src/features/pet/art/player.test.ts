import { describe, expect, it } from 'vitest'

import { hashBuffer } from '@/lib/pixelArt'

import { ENTRANCES, WAKE } from '../motion'
import { createScenePlayer, DEMO_SIGN_DATA, type PlayerInput } from '.'

const INPUT: PlayerInput = {
  room: {
    time: 'dusk',
    season: 'autumn',
    wallColor: 'sand',
    wallPattern: 'dots',
    floor: 'wood',
    bed: 'rug',
    shelf: 'scrolls',
    lamp: 'clay',
    sign: 'none',
  },
  sign: DEMO_SIGN_DATA,
  lampLevel: 3,
  pet: { species: 'dog', coat: 'gold', mood: 'happy', seed: 1000 },
}

describe('scene player', () => {
  it('drops the Zzz the frame an asleep pet dies', () => {
    const pet = { species: 'dog', coat: 'gold', seed: 1000 } as const
    const asleep: PlayerInput = { ...INPUT, pet: { ...pet, mood: 'nap' } }
    const died: PlayerInput = { ...INPUT, pet: { ...pet, mood: 'dead' } }
    const p = createScenePlayer()
    for (let t = 0; t <= 2000; t += 100) p.frame(asleep, t)
    const after = p.frame(died, 2100).buffer
    const fresh = createScenePlayer().frame(died, 2100).buffer
    expect(hashBuffer(after)).toBe(hashBuffer(fresh))
  })

  it('plays an entrance: says hi once, then ends', () => {
    const p = createScenePlayer()
    p.playEntrance('dog', 0)
    const says: string[] = []
    let ended: string | null = null
    for (let t = 0; t <= ENTRANCES.dog.durationMs + 200; t += 100) {
      const f = p.frame(INPUT, t)
      if (f.say) says.push(f.say)
      if (f.ended) ended = f.ended
    }
    expect(says).toEqual(['hi'])
    expect(ended).toBe('entrance')
    expect(p.isBusy()).toBe(false)
  })

  it('pats a happy pet, asks to wake a sleeping one, ignores pats mid-motion', () => {
    const p = createScenePlayer()
    expect(p.pat(0, 'happy')).toBe('pat')
    expect(p.frame(INPUT, 0).say).toBe('pat')
    expect(p.pat(0, 'nap')).toBe('wake')
    expect(p.pat(0, 'dead')).toBe('wake')
    p.playTrick('dog', 100)
    expect(p.pat(150, 'happy')).toBe('busy')
  })

  it('wakes a pet that died with a heart burst', () => {
    const p = createScenePlayer()
    p.playWake(0)
    const dead = {
      ...INPUT,
      pet: { ...INPUT.pet!, mood: 'dead' as const },
      lampLevel: 0,
    }
    let say: string | null = null
    for (let t = 0; t <= WAKE.durationMs + 100; t += 100) {
      const f = p.frame(dead, t)
      if (f.say) say = f.say
      if (t === WAKE.durationMs + 100) expect(f.ended).toBe('wake')
    }
    expect(say).toBe('hi')
  })

  it('is deterministic for a seed', () => {
    const render = () => {
      const p = createScenePlayer({ seed: 9 })
      p.playEntrance('lamb', 0)
      let h = 0
      for (let t = 0; t < 2500; t += 100)
        h ^= hashBuffer(
          p.frame({ ...INPUT, moments: { gold: true } }, t).buffer
        )
      return h
    }
    expect(render()).toBe(render())
  })

  it('skips entrances with Reduce Motion but still says hi', () => {
    const p = createScenePlayer({ reduceMotion: true })
    p.playEntrance('lion', 0)
    expect(p.isBusy()).toBe(false)
    expect(p.frame(INPUT, 0).say).toBe('hi')
  })
})
