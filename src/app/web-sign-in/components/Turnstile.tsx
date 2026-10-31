import { useEffect, useEffectEvent, useRef } from 'react'
import { View } from 'react-native'

/**
 * Cloudflare Turnstile's managed widget (docs/passkeys-protocol.md, "Web
 * sign-up" → Controls), for the recovery key on the web's sign-in screen. It
 * solves while the User types; `onToken` gets each token, and null when one
 * expires or the widget fails. Change `resetKey` after a token was used: each
 * works once. Web only.
 */

const SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      theme: 'auto' | 'light' | 'dark'
      size?: 'normal' | 'flexible' | 'compact'
    }
  ) => string
  reset: (widgetId: string) => void
  remove: (widgetId: string) => void
}

type TrustedTypesWindow = {
  turnstile?: TurnstileApi
  trustedTypes?: {
    createPolicy: (
      name: string,
      rules: { createScriptURL: (url: string) => string }
    ) => { createScriptURL: (url: string) => string }
  }
}

let loading: Promise<TurnstileApi> | null = null
let policy: { createScriptURL: (url: string) => string } | undefined

/**
 * Whether this page loaded Turnstile's script: signing in then reloads, so
 * Cloudflare's code doesn't stay in the signed-in app.
 */
export const turnstileLoaded = (): boolean =>
  loading !== null ||
  (typeof window !== 'undefined' &&
    (window as unknown as TrustedTypesWindow).turnstile !== undefined)

/** Loads Turnstile's script once, through a Trusted Types policy if any. */
function loadTurnstile(): Promise<TurnstileApi> {
  const page = window as unknown as TrustedTypesWindow
  if (page.turnstile) return Promise.resolve(page.turnstile)
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement('script')
    // The CSP requires Trusted Types for scripts; this policy allows only
    // Turnstile's own URL.
    policy ??= page.trustedTypes?.createPolicy('ww-turnstile', {
      createScriptURL: (url) => {
        if (url !== SCRIPT_URL) throw new Error('Not Turnstile')
        return url
      },
    })
    script.src = (policy?.createScriptURL(SCRIPT_URL) ??
      SCRIPT_URL) as unknown as string
    script.async = true
    script.onload = () =>
      page.turnstile ? resolve(page.turnstile) : reject(new Error('turnstile'))
    script.onerror = () => {
      loading = null
      script.remove()
      reject(new Error('turnstile'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export default function Turnstile({
  siteKey,
  action,
  resetKey,
  onToken,
  onError,
}: {
  siteKey: string
  action: string
  resetKey: number
  onToken: (token: string | null) => void
  /** The script didn't load (offline, or blocked). */
  onError: () => void
}) {
  const container = useRef<View>(null)
  const widget = useRef<{ api: TurnstileApi; id: string } | null>(null)
  const token = useEffectEvent(onToken)
  const failed = useEffectEvent(onError)

  useEffect(() => {
    let cancelled = false
    loadTurnstile()
      .then((api) => {
        const element = container.current as unknown as HTMLElement | null
        if (cancelled || !element) return
        const id = api.render(element, {
          sitekey: siteKey,
          action,
          callback: (value) => token(value),
          'expired-callback': () => token(null),
          'error-callback': () => token(null),
          theme: 'auto',
          size: 'flexible',
        })
        widget.current = { api, id }
      })
      .catch(() => {
        if (!cancelled) failed()
      })
    return () => {
      cancelled = true
      if (widget.current) widget.current.api.remove(widget.current.id)
      widget.current = null
    }
  }, [siteKey, action])

  useEffect(() => {
    if (resetKey === 0 || !widget.current) return
    token(null)
    widget.current.api.reset(widget.current.id)
  }, [resetKey])

  return <View ref={container} style={{ minHeight: 65, width: '100%' }} />
}
