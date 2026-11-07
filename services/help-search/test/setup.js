import { timingSafeEqual } from 'node:crypto'

crypto.subtle.timingSafeEqual ??= (a, b) =>
  timingSafeEqual(new Uint8Array(a), new Uint8Array(b))
