import type { PetSpeciesId } from '../art/types'
import type { MotionTable } from './types'

const lion: MotionTable = {
  durationMs: 1900,
  sayAtMs: 1150,
  sayMoment: 'hi',
  pose(u) {
    if (u < 300) return { lie: true, mood: 'joy' }
    if (u < 600) return { lie: true, flip: true, mood: 'joy' }
    if (u < 850) return { lie: true, mood: 'joy' }
    if (u < 1150) {
      return {
        dy: -Math.sin((Math.PI * (u - 850)) / 300) * 7,
        mood: 'wide',
        land: u > 1100,
      }
    }
    return { mood: 'joy' }
  },
}

const dog: MotionTable = {
  durationMs: 1900,
  sayAtMs: 1350,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1300) {
      return {
        flip: Math.floor(u / 70) % 2 === 1,
        dy: -Math.abs(Math.sin(u / 80)) * 3,
        mood: 'joy',
        dust: u % 140 < 20,
      }
    }
    return { mood: 'joy' }
  },
}

const cat: MotionTable = {
  durationMs: 2100,
  sayAtMs: 1550,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1500) {
      const k = (u / 1500) * Math.PI * 3
      return {
        dx: Math.sin(k) * 42,
        flip: Math.cos(k) > 0,
        mood: 'wide',
        dust: u % 100 < 20,
        dy: -Math.abs(Math.sin(u / 50)),
      }
    }
    return { mood: 'joy' }
  },
}

const donkey: MotionTable = {
  durationMs: 2100,
  sayAtMs: 1450,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1400) {
      const k = u / 250
      return {
        dy: -Math.sin(Math.PI * (k % 1)) * 5,
        flip: Math.floor(k) % 2 === 1,
        mood: 'joy',
        land: k % 1 > 0.92,
      }
    }
    return { mood: 'joy' }
  },
}

const lamb: MotionTable = {
  durationMs: 2100,
  sayAtMs: 1450,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1350) {
      const k = u / 450
      return {
        dy: -Math.sin(Math.PI * (k % 1)) * 18,
        mood: 'joy',
        land: k % 1 < 0.06 && u > 100,
      }
    }
    return { mood: 'joy' }
  },
}

export const TRICKS: Readonly<Record<PetSpeciesId, MotionTable>> = {
  lion,
  dog,
  cat,
  donkey,
  lamb,
}
