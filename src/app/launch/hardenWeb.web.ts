import { z } from 'zod/v4'
import { createChunkPolicy } from '@/vendor/web/trustedTypes'

export function hardenWeb() {
  createChunkPolicy()
  z.config({ jitless: true })
}
