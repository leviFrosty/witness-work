import { clamp } from 'react-native-reanimated'

/** Linear 0–1 progress of `t` through `[from, to]`. */
export const span = (t: number, [from, to]: readonly [number, number]) => {
  'worklet'
  return clamp((t - from) / (to - from), 0, 1)
}

/** Eased (cubic out) 0–1 progress of `t` through `[from, to]`. */
export const ease = (t: number, range: readonly [number, number]) => {
  'worklet'
  return 1 - Math.pow(1 - span(t, range), 3)
}
