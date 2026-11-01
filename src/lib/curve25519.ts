type Curves = typeof import('@noble/curves/ed25519.js')

let curves: Curves | undefined

export function curve25519(): Pick<Curves, 'ed25519' | 'x25519'> {
  curves ??= require('@noble/curves/ed25519.js') as Curves
  return curves
}
