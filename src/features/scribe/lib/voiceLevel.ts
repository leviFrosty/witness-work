export interface VoiceLevelRange {
  floor: number
  peak: number
}

const FLOOR_RISE = 0.01
const PEAK_DECAY = 0.025

const MIN_SPAN = 0.14

const GATE = 0.03

export const initialVoiceLevelRange = (): VoiceLevelRange => ({
  floor: 1,
  peak: 0,
})

export const normalizeVoiceLevel = (
  range: VoiceLevelRange,
  level: number
): VoiceLevelRange & { loudness: number } => {
  'worklet'

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

export const VOICE_SPEECH_LOUDNESS = 0.2
