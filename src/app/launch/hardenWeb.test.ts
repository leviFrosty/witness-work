import { afterEach, describe, expect, it, vi } from 'vitest'

const createChunkPolicy = vi.hoisted(() => vi.fn())
vi.mock('@/vendor/web/trustedTypes', () => ({ createChunkPolicy }))

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hardenWeb', () => {
  it('creates the chunk policy, and zod validates without building functions', async () => {
    vi.resetModules()
    // The CSP blocks `new Function`; zod must neither probe for it nor use it.
    const built = vi.fn()
    vi.stubGlobal(
      'Function',
      new Proxy(Function, {
        construct() {
          built()
          throw new EvalError('blocked by the CSP')
        },
      })
    )
    const { hardenWeb } = await import('@/app/launch/hardenWeb.web')
    const { z } = await import('zod/v4')
    hardenWeb()
    expect(createChunkPolicy).toHaveBeenCalledTimes(1)

    const Visit = z.object({ name: z.string(), minutes: z.number().int() })
    expect(Visit.parse({ name: 'Ana', minutes: 30 })).toEqual({
      name: 'Ana',
      minutes: 30,
    })
    expect(Visit.safeParse({ name: 'Ana', minutes: 1.5 }).success).toBe(false)
    expect(Visit.safeParse({ minutes: 30 }).success).toBe(false)
    expect(built).not.toHaveBeenCalled()
  })
})
