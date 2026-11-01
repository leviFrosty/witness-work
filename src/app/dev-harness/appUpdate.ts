import apis from '@/constants/apis'
import { checkAppConfig, useUpdateRequired } from '@/lib/appUpdate'

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
  minAppVersion: (version: string | null) => {
    install()
    floor = version
    void checkAppConfig({ force: true })
    return 'started'
  },

  upgradeRequired: (path: string) => {
    install()
    refusing = path
    return 'ok'
  },

  requests: (since = 0) => log.filter((entry) => entry.at >= since),

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
