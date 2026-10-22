/**
 * Automatic gain for the voice-log waveform. The native meter reports raw input
 * level (0...1 over -50...0 dB) with no gain control, so a cough fills the bar
 * while normal speech barely clears room tone. This tracks the room's noise
 * floor and the recent peak and scales each level between them.
 */
export interface VoiceLevelRange {
  floor: number
  peak: number
}

// Per ~80 ms sample. The floor follows quieter levels at once and creeps up
// over ~8 s of steady sound; the peak follows louder levels at once and
// relaxes over ~3 s, so a cough stops dwarfing the next quiet words.
const FLOOR_RISE = 0.01
const PEAK_DECAY = 0.025
// Smallest span the range shrinks to (~7 dB), so room tone alone isn't
// stretched into full bars.
const MIN_SPAN = 0.14
// Levels this close to the floor stay dots.
const GATE = 0.03

export const initialVoiceLevelRange = (): VoiceLevelRange => ({
  floor: 1,
  peak: 0,
})

/**
 * Folds `level` into `range`; returns the new range and level's loudness,
 * 0...1.
 */
export const normalizeVoiceLevel = (
  range: VoiceLevelRange,
  level: number
): VoiceLevelRange & { loudness: number } => {
  'worklet'
  // 0 is the reset value before the first reading (or below -50 dB): no data.
  if (level <= 0) return { ...range, loudness: 0 }
  const floor =
    level < range.floor
      ? level
      : range.floor + (level - range.floor) * FLOOR_RISE
  const peak =
    level > range.peak ? level : range.peak - (range.peak - level) * PEAK_DECAY
  const span = Math.max(peak - floor, MIN_SPAN)
  const loudness = Math.min(
    Math.max((level - floor - GATE) / (span - GATE), 0),
    1
  )
  return { floor, peak, loudness }
}
