export const CHUNK_POLICY = 'ww-chunks'

const CHUNK_PATH = '/_expo/static/js/web/'

type Policy = { createScriptURL: (url: string) => unknown }
type TrustedTypes = {
  createPolicy: (
    name: string,
    rules: { createScriptURL: (url: string) => string }
  ) => Policy
}

export const WORKER_PATH = '/sw.js'

export function chunkURL(url: string, base: string): string {
  const parsed = new URL(url, base)
  const file = parsed.pathname.slice(CHUNK_PATH.length)
  if (
    parsed.origin !== new URL(base).origin ||
    !parsed.pathname.startsWith(CHUNK_PATH) ||
    !/^[\w.-]+\.js$/.test(file) ||
    file.includes('..') ||
    parsed.search ||
    parsed.hash
  )
    throw new TypeError(`Refused to load a script from ${parsed.origin}`)
  return parsed.href
}

export function workerURL(url: string, base: string): string {
  const parsed = new URL(url, base)
  if (
    parsed.origin !== new URL(base).origin ||
    parsed.pathname !== WORKER_PATH ||
    parsed.search ||
    parsed.hash
  )
    throw new TypeError(`Refused to load a script from ${parsed.origin}`)
  return parsed.href
}

function allowedScriptURL(url: string, base: string): string {
  return new URL(url, base).pathname === WORKER_PATH
    ? workerURL(url, base)
    : chunkURL(url, base)
}

let policy: Policy | undefined

export function createChunkPolicy() {
  const trustedTypes = (globalThis as { trustedTypes?: TrustedTypes })
    .trustedTypes
  if (!trustedTypes || policy) return
  policy = trustedTypes.createPolicy(CHUNK_POLICY, {
    createScriptURL: (url) => allowedScriptURL(url, location.href),
  })
}

export function workerScriptURL(): string {
  const url = workerURL(WORKER_PATH, location.href)
  if (policy) return policy.createScriptURL(url) as string
  return url
}

export function chunkScriptURL(url: string): string {
  if (policy) return policy.createScriptURL(url) as string
  return chunkURL(url, location.href)
}
