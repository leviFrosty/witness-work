#!/usr/bin/env node
/**
 * Synthesizes Scribe AI's voice cues: a soft rising two-note chime when the
 * microphone goes live and its mirror when recording ends. Writes 16-bit mono
 * WAVs to src/assets/audio. iOS plays them as system sounds (which respect the
 * silent switch), so keep them short, linear PCM, and well under 30 s.
 *
 * Usage: node scripts/generate-voice-cues.mjs
 */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const RATE = 44100
const LENGTH = 0.62
const PEAK = 0.36 // about -9 dBFS; system sounds play at the ringer volume

/** A sine note with a short glide into pitch and a soft exponential tail. */
const note = ({ at, from, to, decay, gain }) => {
  const glide = 0.045
  let phase = 0
  return (t) => {
    const local = t - at
    if (local < 0) return 0
    const f = local < glide ? from + (to - from) * (local / glide) : to
    phase += (2 * Math.PI * f) / RATE
    // Raised-cosine attack: no click, reads as a fade-in.
    const attack =
      local < 0.028 ? 0.5 - 0.5 * Math.cos((Math.PI * local) / 0.028) : 1
    const env = attack * Math.exp(-local / decay)
    return (
      gain *
      env *
      (Math.sin(phase) +
        0.12 * Math.sin(2 * phase) +
        0.04 * Math.sin(3 * phase))
    )
  }
}

const render = (notes) => {
  const total = Math.round(RATE * LENGTH)
  const dry = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const t = i / RATE
    dry[i] = notes.reduce((sum, voice) => sum + voice(t), 0)
  }
  // A small room: three feedback combs, mixed low, for warmth.
  const wet = new Float32Array(total)
  for (const [ms, feedback] of [
    [29.7, 0.42],
    [37.1, 0.38],
    [41.1, 0.34],
  ]) {
    const delay = Math.round((RATE * ms) / 1000)
    const comb = new Float32Array(total)
    for (let i = 0; i < total; i++) {
      comb[i] = dry[i] + (i >= delay ? comb[i - delay] * feedback : 0)
      wet[i] += comb[i] / 3
    }
  }
  const out = new Float32Array(total)
  let max = 0
  for (let i = 0; i < total; i++) {
    // Fade the last 120 ms so the tail never cuts off.
    const left = (total - i) / RATE
    const tail = left < 0.12 ? left / 0.12 : 1
    out[i] = (dry[i] * 0.82 + wet[i] * 0.3) * tail
    max = Math.max(max, Math.abs(out[i]))
  }
  for (let i = 0; i < total; i++) out[i] = (out[i] / max) * PEAK
  return out
}

const wav = (samples) => {
  const data = Buffer.alloc(samples.length * 2)
  samples.forEach((s, i) => data.writeInt16LE(Math.round(s * 32767), i * 2))
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(RATE, 24)
  header.writeUInt32LE(RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

const D5 = 587.33
const A5 = 880

const cues = {
  // Up a fifth: the microphone is on.
  'scribe-voice-start.wav': [
    note({ at: 0, from: D5 * 0.96, to: D5, decay: 0.11, gain: 0.8 }),
    note({ at: 0.085, from: A5 * 0.96, to: A5, decay: 0.2, gain: 1 }),
  ],
  // Down a fifth: the microphone is off.
  'scribe-voice-end.wav': [
    note({ at: 0, from: A5 * 1.03, to: A5, decay: 0.1, gain: 0.85 }),
    note({ at: 0.085, from: D5 * 1.03, to: D5, decay: 0.19, gain: 1 }),
  ],
}

const dir = join(import.meta.dirname, '..', 'src', 'assets', 'audio')
for (const [name, notes] of Object.entries(cues)) {
  writeFileSync(join(dir, name), wav(render(notes)))
  console.log(`wrote ${join('src/assets/audio', name)}`)
}
