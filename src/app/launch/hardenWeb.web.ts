import { z } from 'zod/v4'
import { createChunkPolicy } from '@/vendor/web/trustedTypes'

/**
 * The web entry's very first step, before any other module loads or any
 * `import()` runs, so the page keeps to its CSP (ADR 0037 §5):
 *
 * - Creates the one Trusted Types policy the CSP allows, for the app's own script
 *   chunks, before anything else could take its name.
 * - Turns off zod's compiled parsers, which build functions from strings and
 *   probe for that with `new Function`. Schemas read the setting as they're
 *   built, so this comes before any module defines one.
 */
export function hardenWeb() {
  createChunkPolicy()
  z.config({ jitless: true })
}
