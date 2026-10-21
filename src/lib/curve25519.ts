type Curves = typeof import('@noble/curves/ed25519.js')

let curves: Curves | undefined

/**
 * `@noble/curves`' Ed25519 and X25519, loaded on first use. The module computes
 * its field constants (BigInt powers and square roots) when it loads, which on
 * Hermes is several ms of launch; only signing, key agreement and verifying
 * need it.
 */
export function curve25519(): Pick<Curves, 'ed25519' | 'x25519'> {
  curves ??= require('@noble/curves/ed25519.js') as Curves
  return curves
}
