import { MMKV } from 'react-native-mmkv'
import { accountSessions } from '@/lib/serverAccount'
import { toAccountSessionError } from '@/lib/serverAccount/session'

/**
 * This device's account session for the verify harness, never a token.
 * `snapshot()` reads it; `renew()` refreshes it now, as a 401 would.
 * `holdRefreshAnswer(ms)` keeps the next refresh's answer from the session code
 * that long after ww-api sent it (rotating the token), the way a suspended app
 * never reads it; `dropRefreshAnswer()` loses it instead, as a dropped
 * connection does. `markAfter(ms, label)` notes when a JS timer fires. Every
 * step lands in `marks()`, kept in MMKV so a relaunch can read what happened
 * before the app was terminated.
 */

const REFRESH_PATH = '/accounts/v1/sessions/refresh'

let _store: MMKV | null = null
const store = () => (_store ??= new MMKV({ id: 'ww-verify-session' }))

type Mark = { at: number; label: string }

const marks = (): Mark[] => {
  try {
    return JSON.parse(store().getString('marks') ?? '[]') as Mark[]
  } catch {
    return []
  }
}

const mark = (label: string) => {
  store().set(
    'marks',
    JSON.stringify([...marks(), { at: Date.now(), label }].slice(-50))
  )
}

let next: { kind: 'hold'; ms: number } | { kind: 'drop' } | null = null
let realFetch: typeof fetch | null = null

const urlOf = (input: Parameters<typeof fetch>[0]) =>
  typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : input.url

function install() {
  if (realFetch) return
  const real = (realFetch = globalThis.fetch)
  globalThis.fetch = async (input, init) => {
    if (!next || !urlOf(input).endsWith(REFRESH_PATH)) return real(input, init)
    const step = next
    next = null
    const response = await real(input, init)
    const body = await response.text()
    mark(`refresh answered ${response.status}`)
    if (step.kind === 'drop') {
      mark('refresh answer dropped')
      throw new TypeError('The network connection was lost.')
    }
    mark(`refresh answer held ${step.ms}ms`)
    await new Promise((resolve) => setTimeout(resolve, step.ms))
    mark('refresh answer delivered')
    return new Response(body, {
      status: response.status,
      headers: response.headers,
    })
  }
}

export const sessionHarness = {
  snapshot: () => accountSessions.snapshot(),
  /** Refreshes the access token now; the outcome lands in `marks()`. */
  renew: () => {
    mark('renew started')
    void accountSessions
      .withSession(async (_authorization, session) => session.sessionId, {
        renew: true,
      })
      .then(
        (sessionId) => mark(`renewed ${sessionId}`),
        (error: unknown) =>
          mark(`renew failed ${toAccountSessionError(error).failure}`)
      )
    return 'started'
  },
  holdRefreshAnswer: (ms: number) => {
    install()
    next = { kind: 'hold', ms }
    return 'ok'
  },
  dropRefreshAnswer: () => {
    install()
    next = { kind: 'drop' }
    return 'ok'
  },
  markAfter: (ms: number, label: string) => {
    setTimeout(() => mark(label), ms)
    return 'ok'
  },
  marks,
  clearMarks: () => {
    store().delete('marks')
    return 'ok'
  },
  /** Real answers again. */
  clear: () => {
    if (realFetch) globalThis.fetch = realFetch
    realFetch = null
    next = null
    return 'ok'
  },
}
