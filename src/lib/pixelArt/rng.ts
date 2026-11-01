const MODULUS = 2147483647
const MULTIPLIER = 16807

export function nextState(state: number): number {
  return (state * MULTIPLIER) % MODULUS
}

export function stateValue(state: number): number {
  return state / MODULUS
}

export function seedFrom(seed: number): number {
  if (!Number.isFinite(seed)) return 1
  const s = Math.abs(Math.floor(seed)) % MODULUS
  return s === 0 ? 1 : s
}

export function createRng(seed: number): () => number {
  let s = seedFrom(seed)
  return () => {
    s = nextState(s)
    return stateValue(s)
  }
}

export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
