/**
 * The web app's Trusted Types policy for script URLs (ADR 0037 §5). The CSP
 * requires Trusted Types for scripts and allows this policy name once, so the
 * entry creates it before anything else runs (`hardenWeb.web.ts`), and nothing
 * loaded later can take it. It allows only this origin's script chunks
 * (`fetchThenEval.ts`); everything else is refused.
 */

/** The CSP allows this name once (`TRUSTED_TYPES_POLICIES` in `web/host`). */
export const CHUNK_POLICY = 'ww-chunks'

/** Where `expo export` writes the web build's script chunks. */
const CHUNK_PATH = '/_expo/static/js/web/'

type Policy = { createScriptURL: (url: string) => unknown }
type TrustedTypes = {
  createPolicy: (
    name: string,
    rules: { createScriptURL: (url: string) => string }
  ) => Policy
}

/**
 * `url` as an absolute URL, if it's a script chunk on this origin. A chunk's
 * name is a plain file name, so anything else in it (a query, a fragment, an
 * encoded or `..` path) is refused too.
 */
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

let policy: Policy | undefined

/** Creates the policy, where the browser has Trusted Types. Call it once. */
export function createChunkPolicy() {
  const trustedTypes = (globalThis as { trustedTypes?: TrustedTypes })
    .trustedTypes
  if (!trustedTypes || policy) return
  policy = trustedTypes.createPolicy(CHUNK_POLICY, {
    createScriptURL: (url) => chunkURL(url, location.href),
  })
}

/**
 * A script chunk's URL for `script.src`: a `TrustedScriptURL` where the browser
 * has Trusted Types, otherwise the checked URL itself. TypeScript's DOM types
 * call `src` a string, so the trusted value is typed as one.
 */
export function chunkScriptURL(url: string): string {
  if (policy) return policy.createScriptURL(url) as string
  return chunkURL(url, location.href)
}
