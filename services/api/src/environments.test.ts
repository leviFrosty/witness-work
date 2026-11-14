import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * The three environments in wrangler.toml, pinned where a slip would cross
 * them: production (`ww-proxy`, top level), Beta (`ww-proxy-beta`,
 * `[env.beta]`, the tip of `main`), and development (`[env.dev]`, the config
 * of a local `wrangler dev --env dev`; nothing is deployed from it). A named
 * env inherits no vars or bindings, so each block is read on its own.
 */

const toml = readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')

type Table = { header: string; lines: string[] }
const tables: Table[] = [{ header: '', lines: [] }]
for (const line of toml.split('\n')) {
  const header = /^\s*(\[\[?[^\]]+\]\]?)/.exec(line)?.[1]
  if (header) tables.push({ header, lines: [] })
  else tables.at(-1)!.lines.push(line)
}

/** An uncommented `name = …` in a table, without its quotes or a trailing comment. */
const field = (table: Table | undefined, name: string): string | undefined => {
  const pattern = new RegExp(`^\\s*${name}\\s*=\\s*(.+?)\\s*(#.*)?$`)
  const value = table?.lines.map((line) => pattern.exec(line)).find(Boolean)?.[1]
  return value?.replace(/^("""|'''|"|')|("""|'''|"|')$/g, '')
}

const ENVS = { production: '', beta: 'env.beta.', dev: 'env.dev.' } as const
type Env = keyof typeof ENVS
const NAMES = Object.keys(ENVS) as Env[]

/** `[vars]`, `[env.beta.vars]` or `[env.dev.vars]`. */
const vars = (env: Env, name: string) =>
  field(
    tables.find((table) => table.header === `[${ENVS[env]}vars]`),
    name
  )

/** Every `[[<env>.<kind>]]` table's value for `name`. */
const each = (env: Env, kind: string, name: string) =>
  tables
    .filter((table) => table.header === `[[${ENVS[env]}${kind}]]`)
    .map((table) => field(table, name))

const perEnv = (read: (env: Env) => unknown) =>
  Object.fromEntries(NAMES.map((env) => [env, read(env)]))

const list = (value: string | undefined) =>
  (value ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)

describe('wrangler.toml environments', () => {
  it('names a Worker for each, and only Beta and production have hosts', () => {
    expect(field(tables[0], 'name')).toBe('ww-proxy')
    const head = (env: 'beta' | 'dev') =>
      tables.find((table) => table.header === `[env.${env}]`)
    expect(field(head('beta'), 'name')).toBe('ww-proxy-beta')
    // Routes are inherited, so the local env needs its own empty list.
    expect(field(head('dev'), 'routes')).toBe('[]')
    expect(perEnv((env) => each(env, 'routes', 'pattern')[0])).toEqual({
      production: 'ww-proxy.leviwilkerson.com',
      beta: 'api-beta.witnesswork.app',
      dev: undefined,
    })
    expect(each('production', 'routes', 'pattern')).toContain('api.witnesswork.app')
    // The deployed dev tier is gone.
    expect(toml).not.toMatch(/^[^#\n]*(api-dev|app-dev|maps-dev|verify-dev|\bdev)\.witnesswork\.app/m)
    expect(toml).not.toMatch(/^[^#\n]*workers\.dev/m)
  })

  it('attests in production everywhere but locally', () => {
    expect(perEnv((env) => vars(env, 'APP_ATTEST_ENVIRONMENT'))).toEqual({
      production: 'production',
      // TestFlight builds use Apple's production App Attest environment.
      beta: 'production',
      dev: 'development',
    })
  })

  it('pins each environment to its own iOS app', () => {
    expect(perEnv((env) => vars(env, 'IOS_BUNDLE_ID'))).toEqual({
      production: 'com.leviwilkerson.jwtime',
      beta: 'com.leviwilkerson.jwtimebeta',
      dev: 'com.leviwilkerson.jwtimedev',
    })
    // Transitional: Beta builds from before the Beta API still call production.
    expect(perEnv((env) => vars(env, 'IOS_ADDITIONAL_BUNDLE_IDS'))).toEqual({
      production: 'com.leviwilkerson.jwtimebeta',
      beta: undefined,
      dev: undefined,
    })
  })

  it('keeps development-only behaviour out of Beta and production', () => {
    expect(perEnv((env) => vars(env, 'REVENUECAT_COUNT_WEB_SANDBOX'))).toEqual({
      production: undefined,
      beta: undefined,
      dev: 'true',
    })
    // Cloudflare's always-passing Turnstile test key.
    expect(vars('dev', 'TURNSTILE_SITE_KEY')).toBe('1x00000000000000000000AA')
    for (const env of ['production', 'beta'] as const) {
      expect(vars(env, 'TURNSTILE_SITE_KEY') ?? '').not.toMatch(/^[123]x0+/)
      for (const name of ['WEB_APP_ORIGIN', 'WEB_APP_ORIGINS', 'PASSKEY_ORIGINS', 'MAPKIT_JS_ORIGINS']) {
        expect(vars(env, name) ?? '', `${env} ${name}`).not.toMatch(/localhost|127\.0\.0\.1|http:/)
      }
    }
    // The bypass token is a secret of the local worker only (.dev.vars).
    expect(toml).not.toMatch(/^\s*NOTES_IMPORT_DEV_BYPASS_TOKEN\s*=/m)
  })

  it('has no Turnstile widget on Beta yet, so web sign-up answers disabled there', () => {
    expect(vars('beta', 'TURNSTILE_SITE_KEY')).toBeUndefined()
    expect(vars('beta', 'TURNSTILE_HOSTNAMES')).toBe('verify-beta.witnesswork.app')
  })

  it('turns the feature fallbacks on in Beta and locally, with legacy auth off', () => {
    const fallbacks = (env: Env) =>
      Object.fromEntries(
        [
          'BUDDIES_ENABLED',
          'BUDDIES_PHOTOS',
          'SYNC_ENABLED',
          'SYNC_CHANGES',
          'SPACES_ENABLED',
          'SPACES_GUESTS',
          'AUTH_LEGACY',
        ].map((name) => [name, vars(env, name)])
      )
    const on = {
      BUDDIES_ENABLED: 'true',
      BUDDIES_PHOTOS: 'on',
      SYNC_ENABLED: 'true',
      SYNC_CHANGES: 'true',
      SPACES_ENABLED: 'true',
      SPACES_GUESTS: 'true',
      AUTH_LEGACY: 'off',
    }
    expect(fallbacks('beta')).toEqual(on)
    expect(fallbacks('dev')).toEqual(on)
    expect(fallbacks('production')).toEqual({
      BUDDIES_ENABLED: 'false',
      BUDDIES_PHOTOS: undefined,
      SYNC_ENABLED: 'false',
      SYNC_CHANGES: 'false',
      SPACES_ENABLED: 'false',
      SPACES_GUESTS: 'false',
      AUTH_LEGACY: 'on',
    })
  })

  it('gives each environment its own web app, passkey RP ID and frames', () => {
    expect(perEnv((env) => list(vars(env, 'WEB_APP_ORIGINS')))).toEqual({
      // beta.app stays for Beta web builds from before the Beta API.
      production: ['https://app.witnesswork.app', 'https://beta.app.witnesswork.app'],
      beta: ['https://beta.app.witnesswork.app'],
      dev: [8081, 8082, 19006, 4173, 5173].map((port) => `http://localhost:${port}`),
    })
    expect(perEnv((env) => vars(env, 'WEB_APP_ORIGIN'))).toEqual({
      production: undefined,
      beta: 'https://beta.app.witnesswork.app',
      dev: 'http://localhost:8081',
    })
    expect(perEnv((env) => list(vars(env, 'PASSKEY_RP_IDS')))).toEqual({
      production: ['app.witnesswork.app'],
      beta: ['beta.app.witnesswork.app'],
      // Native development builds borrow Beta's RP ID; browsers use localhost.
      dev: ['beta.app.witnesswork.app', 'localhost'],
    })
    for (const env of NAMES) {
      const origins = JSON.parse(vars(env, 'PASSKEY_ORIGINS') ?? '{}') as Record<string, string[]>
      expect(Object.keys(origins), env).toEqual(list(vars(env, 'PASSKEY_RP_IDS')))
      for (const [rpId, paired] of Object.entries(origins)) {
        const web = paired.filter((origin) => !origin.startsWith('android:'))
        expect(web.length, `${env} ${rpId}`).toBeGreaterThan(0)
        // A web origin's host is its RP ID or a subdomain of it.
        for (const origin of web) {
          const host = new URL(origin).hostname
          expect(host === rpId || host.endsWith(`.${rpId}`), `${env} ${origin}`).toBe(true)
        }
      }
    }
    // Android has no Beta app, so Beta pairs no Android origin.
    expect(vars('beta', 'PASSKEY_ORIGINS')).not.toContain('android:')
    expect(perEnv((env) => vars(env, 'MAPKIT_JS_ORIGINS'))).toEqual({
      production: 'https://maps.witnesswork.app',
      beta: 'https://maps-beta.witnesswork.app',
      dev: 'https://maps-beta.witnesswork.app',
    })
  })

  it('shares no storage between environments', () => {
    const ids = (kind: string, name: string) => NAMES.flatMap((env) => each(env, kind, name))
    for (const [kind, name, perEnvironment] of [
      ['kv_namespaces', 'id', 1],
      ['d1_databases', 'database_id', 1],
      ['d1_databases', 'database_name', 1],
      ['r2_buckets', 'bucket_name', 4],
      ['ratelimits', 'namespace_id', 8],
    ] as const) {
      const all = ids(kind, name)
      expect(all, kind).toHaveLength(perEnvironment * NAMES.length)
      expect(all.every(Boolean), kind).toBe(true)
      expect(new Set(all).size, `${kind} ${name}`).toBe(all.length)
    }
    expect(perEnv((env) => each(env, 'd1_databases', 'database_name'))).toEqual({
      production: ['ww-accounts'],
      beta: ['ww-accounts-beta'],
      dev: ['ww-accounts-dev'],
    })
    expect(perEnv((env) => each(env, 'r2_buckets', 'bucket_name'))).toEqual(
      perEnv((env) =>
        ['ww-buddy-blobs', 'ww-account-backups', 'ww-account-sync', 'ww-account-photos'].map(
          (bucket) => `${bucket}${{ production: '', beta: '-beta', dev: '-dev' }[env]}`
        )
      )
    )
    expect(perEnv((env) => each(env, 'ratelimits', 'namespace_id'))).toEqual({
      production: [1001, 1002, 1003, 1004, 1005, 1006, 1007, 1008].map(String),
      beta: [3001, 3002, 3003, 3004, 3005, 3006, 3007, 3008].map(String),
      dev: [2001, 2002, 2003, 2004, 2005, 2006, 2007, 2008].map(String),
    })
  })

  it('binds the same things in every environment', () => {
    for (const [kind, name] of [
      ['kv_namespaces', 'binding'],
      ['d1_databases', 'binding'],
      ['r2_buckets', 'binding'],
      ['ratelimits', 'name'],
      ['durable_objects.bindings', 'name'],
    ] as const) {
      const production = each('production', kind, name)
      expect(production.length, kind).toBeGreaterThan(0)
      expect(each('beta', kind, name), `beta ${kind}`).toEqual(production)
      expect(each('dev', kind, name), `dev ${kind}`).toEqual(production)
    }
    for (const env of NAMES) {
      const table = (name: string) => tables.find((each) => each.header === `[${ENVS[env]}${name}]`)
      expect(field(table('version_metadata'), 'binding'), env).toBe('CF_VERSION_METADATA')
      expect(field(table('triggers'), 'crons'), env).toBe('["17 * * * *"]')
    }
  })

  it('deploys each bucket the deploy script prepares, and no other', () => {
    const scripts = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ).scripts as Record<string, string>
    const prepared = (script: string) =>
      [...script.matchAll(/r2-lifecycle\.mjs (\S+)/g)].map((match) => match[1])
    expect(prepared(scripts.deploy)).toEqual(each('production', 'r2_buckets', 'bucket_name'))
    expect(prepared(scripts['deploy:beta'])).toEqual(each('beta', 'r2_buckets', 'bucket_name'))
    expect(scripts.deploy).not.toMatch(/--env/)
    expect(scripts['deploy:beta']).toMatch(/wrangler deploy --env beta /)
    // Development is local only: `pnpm dev`, never a deploy.
    expect(scripts.dev).toBe('wrangler dev --env dev')
    expect(Object.keys(scripts).filter((name) => /^deploy/.test(name))).toEqual(['deploy', 'deploy:beta'])
    // `--env dev` deploys only an update Worker (wrangler-updates.json).
    for (const script of Object.values(scripts)) {
      if (/wrangler deploy\b.*--env dev\b/.test(script)) expect(script).toContain('--config wrangler-updates.json')
    }
  })
})
