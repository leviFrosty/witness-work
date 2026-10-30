import { timingSafeEqual } from 'node:crypto'

// Workers adds timingSafeEqual to SubtleCrypto; Node doesn't have it.
crypto.subtle.timingSafeEqual ??= (a, b) =>
  timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
