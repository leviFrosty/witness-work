import type { PetSpeciesId } from '../art/types'
import { easeOut, lerp } from './ease'
import type { MotionTable } from './types'

const lion: MotionTable = {
  durationMs: 2100,
  sayAtMs: 1500,
  sayMoment: 'hi',
  pose(u) {
    if (u < 800) {
      return {
        dx: lerp(-100, 0, easeOut(u / 800)),
        dy: -Math.abs(Math.sin(u / 55)) * 2,
        flip: true,
        mood: 'happy',
        dust: u % 110 < 20,
      }
    }
    if (u < 1050) return { bobAdd: 2, flip: true, mood: 'happy' }
    if (u < 1450)
      return {
        dy: -Math.sin((Math.PI * (u - 1050)) / 400) * 11,
        mood: 'joy',
        flip: true,
      }
    if (u < 1600) return { bobAdd: 2, mood: 'joy', land: true }
    return { mood: 'joy' }
  },
}

const dog: MotionTable = {
  durationMs: 2500,
  sayAtMs: 1850,
  sayMoment: 'hi',
  pose(u) {
    if (u < 600) {
      return {
        dx: lerp(110, -16, u / 600),
        dy: -Math.abs(Math.sin(u / 45)) * 2,
        mood: 'joy',
        dust: u % 90 < 20,
      }
    }
    if (u < 820) {
      return {
        dx: lerp(-16, -11, (u - 600) / 220),
        bobAdd: 1,
        mood: 'wide',
        dust: u % 60 < 20,
      }
    }
    if (u < 1100) {
      return {
        dx: lerp(-11, 0, (u - 820) / 280),
        flip: true,
        mood: 'happy',
        dy: -Math.abs(Math.sin(u / 50)),
      }
    }
    if (u < 1700) {
      return {
        flip: Math.floor(u / 75) % 2 === 1,
        dy: -Math.abs(Math.sin((u - 1100) / 95)) * 3,
        mood: 'joy',
      }
    }
    if (u < 1850) return { bobAdd: 1, mood: 'happy' }
    return { mood: 'joy' }
  },
}

const cat: MotionTable = {
  durationMs: 1900,
  sayAtMs: 1300,
  sayMoment: 'hi',
  pose(u) {
    if (u < 550) {
      const k = u / 550
      return { dy: lerp(-90, 0, k * k), mood: 'wide' }
    }
    if (u < 700) return { bobAdd: 2, mood: 'wide', land: true }
    if (u < 900)
      return { dy: -Math.sin((Math.PI * (u - 700)) / 200) * 3, mood: 'happy' }
    if (u < 1250) return { bobAdd: -1, mood: 'happy' }
    return { mood: 'joy' }
  },
}

const donkey: MotionTable = {
  durationMs: 2700,
  sayAtMs: 1950,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1300) {
      return {
        dx: lerp(-100, 0, u / 1300),
        dy: -(Math.floor(u / 120) % 2) * 2,
        flip: true,
        mood: 'happy',
        dust: u % 240 < 20,
      }
    }
    if (u < 1500) return { flip: true, mood: 'happy' }
    if (u < 1900) {
      const k = (u - 1500) / 200
      return {
        dy: -Math.sin(Math.PI * (k % 1)) * 4,
        flip: k < 1,
        mood: 'joy',
        land: k % 1 > 0.9,
      }
    }
    return { mood: 'joy' }
  },
}

const lamb: MotionTable = {
  durationMs: 2300,
  sayAtMs: 1850,
  sayMoment: 'hi',
  pose(u) {
    if (u < 1350) {
      const k = u / 450
      return {
        dx: lerp(100, 0, u / 1350),
        dy: -Math.sin(Math.PI * (k % 1)) * 12,
        mood: 'joy',
        land: k % 1 < 0.08 && u > 100,
      }
    }
    if (u < 1500) return { bobAdd: 2, mood: 'happy', land: u < 1380 }
    if (u < 1800) return { dx: Math.floor(u / 60) % 2 ? 1 : -1, mood: 'joy' }
    return { mood: 'joy' }
  },
}

export const ENTRANCES: Readonly<Record<PetSpeciesId, MotionTable>> = {
  lion,
  dog,
  cat,
  donkey,
  lamb,
}
