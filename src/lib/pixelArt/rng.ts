/**
 * Seeded randomness (Park–Miller minimal standard). Deterministic across
 * devices, so art that scatters pixels (plaster flecks, stones, snow) and
 * particle systems look identical everywhere.
 */

const MODULUS = 2147483647
const MULTIPLIER = 16807

/** The next generator state after `state`. */
export function nextState(state: number): number {
  return (state * MULTIPLIER) % MODULUS
}

/** The value in [0, 1) that `state` represents. */
export function stateValue(state: number): number {
  return state / MODULUS
}

/**
 * A normalized seed: a positive integer below the modulus. Negative seeds use
 * their magnitude; 0, multiples of the modulus and non-finite seeds become 1
 * (state 0 would repeat 0 forever).
 */
export function seedFrom(seed: number): number {
  if (!Number.isFinite(seed)) return 1
  const s = Math.abs(Math.floor(seed)) % MODULUS
  return s === 0 ? 1 : s
}

/**
 * A generator of values in [0, 1). The same seed gives the same sequence. Any
 * number is a valid seed (normalized with {@link seedFrom}).
 */
export function createRng(seed: number): () => number {
  let s = seedFrom(seed)
  return () => {
    s = nextState(s)
    return stateValue(s)
  }
}

/** A stable 32-bit FNV-1a hash of a string (for seeding from ids). */
export function hashString(text: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
