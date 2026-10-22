import apis from '@/constants/apis'
import { checkAppConfig, useUpdateRequired } from '@/lib/appUpdate'

/**
 * Update Required for the verify harness, without a floor on the shared local
 * API: this device's `fetch` answers ww-api in its place. `minAppVersion(v)`
 * serves `GET /app/v1/config` with that floor and reads it now, as a foreground
 * return would; `upgradeRequired(path)` answers 426 `upgrade_required` to every
 * ww-api request whose URL contains `path` (`'/accounts/v1/backup/'`,
 * `'/accounts/v1/sync/'`, `'/buddies/v1/'`, `'/notes-import/usage'`; `''` for
 * all). `requests()` lists the ww-api requests sent since, to see what keeps
 * calling while the app is gated. `clear()` hands requests back to the real
 * API. `cloudSync.checkConfig()` reads the config again, as a foreground return
 * or reconnect does.
 */

type Logged = { at: number; method: string; path: string; status: number }

let realFetch: typeof fetch | null = null
let floor: string | null | undefined
let refusing: string | null = null
let log: Logged[] = []

const apiOrigin = () => new URL(apis.appConfig).origin

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

function install() {
  if (realFetch) return
  const real = (realFetch = globalThis.fetch)
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    if (!url.startsWith(apiOrigin())) return real(input, init)
    const path = url.slice(apiOrigin().length)
    const method = init?.method ?? 'GET'
    let response: Response
    if (floor !== undefined && url.startsWith(apis.appConfig)) {
      const config = (await (await real(input, init)).json()) as object
      response = jsonResponse(200, { ...config, minAppVersion: floor })
    } else if (refusing !== null && path.includes(refusing)) {
      response = jsonResponse(426, {
        ok: false,
        error: 'upgrade_required',
        message: 'Update WitnessWork (verify harness)',
      })
    } else {
      response = await real(input, init)
    }
    log.push({ at: Date.now(), method, path, status: response.status })
    if (log.length > 500) log = log.slice(-500)
    return response
  }
}

export const appUpdateHarness = {
  /** Serves this floor (null: none) from the config, then reads it. */
  minAppVersion: (version: string | null) => {
    install()
    floor = version
    void checkAppConfig({ force: true })
    return 'started'
  },
  /** Answers 426 to ww-api requests whose URL contains `path`. */
  upgradeRequired: (path: string) => {
    install()
    refusing = path
    return 'ok'
  },
  /** Ww-api requests since the harness took over `fetch` (or `since`). */
  requests: (since = 0) => log.filter((entry) => entry.at >= since),
  /** Real answers again; Update Required stays until the next check. */
  clear: () => {
    if (realFetch) globalThis.fetch = realFetch
    realFetch = null
    floor = undefined
    refusing = null
    log = []
    return 'ok'
  },
  state: () => ({
    required: useUpdateRequired.getState().required,
    floor: floor ?? null,
    refusing,
  }),
}
