import { describe, expect, it } from 'vitest'

import { createBuffer, hashBuffer, pixelAt } from '@/lib/pixelArt'

import {
  clearDust,
  createParticles,
  draw,
  emitDust,
  emitHeartBurst,
  emitPatHeart,
  step,
  type ParticleState,
} from './particles'

function run(seed: number): ParticleState {
  let s = createParticles(seed)
  for (let t = 0; t <= 3000; t += 100) {
    s = step(s, t, t < 1500 ? 'joy' : 'nap', { gold: true })
    if (t === 400) s = emitPatHeart(s, t)
  }
  return s
}

describe('particles', () => {
  it('is deterministic per seed and never mutates its input', () => {
    expect(run(5)).toEqual(run(5))
    expect(run(5)).not.toEqual(run(6))
    const s = createParticles(1)
    const frozen = JSON.stringify(s)
    step(s, 0, 'joy', { gold: true })
    emitPatHeart(s, 0)
    emitDust(s, 0, 0, false, true)
    expect(JSON.stringify(s)).toBe(frozen)
  })

  it('spawns Zzz while asleep, hearts while joyful, sparkles when gold', () => {
    let s = createParticles(1)
    s = step(s, 1, 'nap')
    expect(s.particles.map((p) => p.kind)).toEqual(['zzz'])
    s = step(s, 500, 'nap')
    expect(s.particles).toHaveLength(1)
    s = step(s, 1200, 'nap', { gold: true })
    expect(s.particles.map((p) => p.kind).sort()).toEqual([
      'sparkle',
      'zzz',
      'zzz',
    ])
    s = step(s, 1300, 'joy')
    expect(s.particles.map((p) => p.kind).sort()).toEqual(['heart', 'sparkle'])
    s = step(s, 10000, 'happy')
    expect(s.particles).toHaveLength(0)
  })

  it('clears the Zzz as soon as the mood leaves nap', () => {
    let s = step(createParticles(1), 1, 'nap')
    s = step(s, 1200, 'nap')
    expect(s.particles.filter((p) => p.kind === 'zzz')).toHaveLength(2)

    const died = step(s, 1300, 'dead')
    expect(died.particles).toEqual([])
    const buf = createBuffer(180, 100)
    draw(buf, died, 1300, [52, 52])
    for (let y = 0; y < 100; y++)
      for (let x = 0; x < 180; x++) expect(pixelAt(buf, x, y)).toBeNull()

    const woken = step(step(s, 1300, 'weak'), 5000, 'weak')
    expect(woken.particles.some((p) => p.kind === 'zzz')).toBe(false)
  })

  it('expires dust and keeps burst hearts hidden until they are born', () => {
    let s = emitDust(createParticles(1), 0, 0, true, true)
    expect(s.dust).toHaveLength(2)
    s = step(s, 600, 'happy')
    expect(s.dust).toHaveLength(0)
    expect(clearDust(emitDust(s, 0, 0, false, false)).dust).toHaveLength(0)
    const burst = emitHeartBurst(createParticles(1), 1000)
    const a = createBuffer(180, 100)
    draw(a, burst, 1000, [52, 52])
    const b = createBuffer(180, 100)
    draw(b, burst, 1400, [52, 52])
    expect(hashBuffer(a)).not.toBe(hashBuffer(b))
  })

  it('draws pet-relative particles at the origin and dust in the scene, clipped', () => {
    const s = emitDust(emitPatHeart(createParticles(1), 0), 0, 0, false, false)
    const buf = createBuffer(180, 100)
    draw(buf, s, 0, [52, 52])
    let pet = 0
    for (let y = 45; y < 56; y++)
      for (let x = 50; x < 80; x++) if (pixelAt(buf, x, y) !== null) pet++
    expect(pet).toBeGreaterThan(0)
    expect(pixelAt(buf, 76, 81)).not.toBeNull()
    expect(() => draw(buf, s, 0, [-500, 900])).not.toThrow()
  })

  it('freezes drift with Reduce Motion', () => {
    const s = emitPatHeart(createParticles(1), 0)
    const a = createBuffer(180, 100)
    const b = createBuffer(180, 100)
    draw(a, s, 100, [52, 52], { frozen: true })
    draw(b, s, 600, [52, 52], { frozen: true })
    expect(hashBuffer(a)).toBe(hashBuffer(b))
  })
})
