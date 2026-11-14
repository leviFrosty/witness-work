import { describe, expect, it, vi } from 'vitest'

vi.mock('cloudflare:workers', () => ({ DurableObject: class {} }))

import { app } from '../app'
import { OPENAPI_TAGS } from './route'

const env = {
  RATE_LIMITER: { limit: async () => ({ success: true }) },
} as never

const get = (path: string) =>
  app.fetch(new Request(`https://ww-proxy.leviwilkerson.com${path}`), env)

type Operation = {
  summary?: string
  tags?: string[]
  responses?: Record<string, unknown>
}
type Spec = {
  openapi: string
  paths: Record<string, Record<string, Operation>>
}

const loadSpec = async (): Promise<Spec> => {
  const response = await get('/openapi.json')
  expect(response.status).toBe(200)
  return response.json()
}

/** Every method and path the app serves, in OpenAPI's `{param}` form. */
const servedRoutes = () =>
  new Set(
    app.routes
      .filter((route) => route.method !== 'ALL')
      .map(
        (route) => `${route.method} ${route.path.replace(/:(\w+)/g, '{$1}')}`
      )
  )

describe('OpenAPI document', () => {
  it('documents every route the app serves', async () => {
    const spec = await loadSpec()
    const documented = new Set(
      Object.entries(spec.paths).flatMap(([path, item]) =>
        Object.keys(item).map((method) => `${method.toUpperCase()} ${path}`)
      )
    )
    expect(
      [...servedRoutes()].filter((route) => !documented.has(route))
    ).toEqual([])
  })

  it('gives every operation a known tag, a summary, and responses', async () => {
    const spec = await loadSpec()
    expect(spec.openapi).toBe('3.1.0')
    const tags = new Set(OPENAPI_TAGS.map((tag) => tag.name))
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, operation] of Object.entries(item)) {
        const where = `${method.toUpperCase()} ${path}`
        expect(operation.summary, where).toBeTruthy()
        expect(operation.tags, where).toHaveLength(1)
        expect(tags.has(operation.tags![0]), where).toBe(true)
        expect(Object.keys(operation.responses ?? {}), where).not.toHaveLength(
          0
        )
      }
    }
  })

  it('drops zod’s safe-integer bounds', async () => {
    const spec = JSON.stringify(await loadSpec())
    expect(spec).not.toContain(String(Number.MAX_SAFE_INTEGER))
  })

  it('serves the Scalar reference at /docs', async () => {
    const response = await get('/docs')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/html')
    expect(await response.text()).toContain('/openapi.json')
  })
})

describe('servers', () => {
  it('lists api.witnesswork.app first, keeps the original host, then Beta', async () => {
    const { servers } = (await (await get('/openapi.json')).json()) as {
      servers: { url: string }[]
    }
    expect(servers.map((server) => server.url)).toEqual([
      'https://api.witnesswork.app',
      'https://ww-proxy.leviwilkerson.com',
      'https://api-beta.witnesswork.app',
    ])
  })
})
