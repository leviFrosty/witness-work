import {
  createElement,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
} from 'react'
import { View } from 'react-native'
import links from '@/constants/links'
import i18n from '@/lib/locales'
import { createTurnstileBridge } from '@/lib/turnstileFrame/bridge'
import {
  frameUrl,
  type TurnstileAction,
  type TurnstileErrorReason,
} from '@/lib/turnstileFrame/protocol'

/**
 * Cloudflare Turnstile's managed widget (docs/passkeys-protocol.md, "Web
 * sign-up" → Controls), for the web's recovery key sign-in and sign-up. It
 * solves while the User types; `onToken` gets each token, and null when one
 * expires or the check fails. Change `resetKey` after a token was used: each
 * works once. Web only.
 *
 * Cloudflare's script runs only in a sandboxed frame on its own origin
 * (`links.turnstileFrame`, docs/web-turnstile.md), never in the app's realm,
 * which holds decrypted data and the account key (ADR 0037 §5). The frame
 * passes back only the token and what happened to the check.
 */

/** The managed widget's height, in any size but `compact`. */
const WIDGET_HEIGHT = 65

export default function Turnstile({
  siteKey,
  action,
  resetKey,
  onToken,
  onError,
  onReady,
  onExpired,
}: {
  siteKey: string
  action: TurnstileAction
  resetKey: number
  onToken: (token: string | null) => void
  /**
   * The frame or its script didn't load (offline, or blocked: `script`), or the
   * check failed or timed out (`check`; the widget shows it too).
   */
  onError: (reason: TurnstileErrorReason) => void
  /** The frame's first `ready` or token: the widget is up. */
  onReady?: () => void
  /** The last token expired unused (after `onToken(null)`). */
  onExpired?: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const bridge = useRef<ReturnType<typeof createTurnstileBridge> | null>(null)
  const token = useEffectEvent(onToken)
  const failed = useEffectEvent(onError)
  const up = useEffectEvent(() => onReady?.())
  const expired = useEffectEvent(() => onExpired?.())

  // A layout effect, so the bridge exists before the new frame can load.
  useLayoutEffect(() => {
    const current = createTurnstileBridge({
      origin: links.turnstileFrame,
      action,
      target: () => frame.current?.contentWindow ?? null,
      onToken: (value) => token(value),
      onError: (reason) => failed(reason),
      onReady: () => up(),
      onExpired: () => expired(),
    })
    bridge.current = current
    const listener = (event: MessageEvent) =>
      current.receive({
        origin: event.origin,
        source: event.source,
        data: event.data,
      })
    window.addEventListener('message', listener)
    return () => {
      window.removeEventListener('message', listener)
      current.dispose()
      if (bridge.current === current) bridge.current = null
    }
  }, [siteKey, action, resetKey])

  // A reset draws a new frame (its `key`), so no message from the old one is
  // heard: the old token is gone.
  useEffect(() => {
    if (resetKey !== 0) token(null)
  }, [resetKey])

  return (
    <View style={{ height: WIDGET_HEIGHT, width: '100%' }}>
      {createElement('iframe', {
        key: `${siteKey}:${action}:${resetKey}`,
        ref: frame,
        src: frameUrl(links.turnstileFrame, { siteKey, action }),
        title: i18n.t('webSignIn_recoveryCheckLabel'),
        // Scripts on the frame's own origin, which isn't the app's, so it
        // reaches nothing of the app's; no popups, forms or navigation.
        sandbox: 'allow-scripts allow-same-origin',
        referrerPolicy: 'no-referrer',
        allow: '',
        onLoad: () => bridge.current?.frameLoaded(),
        style: {
          border: 0,
          width: '100%',
          height: WIDGET_HEIGHT,
          display: 'block',
          colorScheme: 'normal',
        },
      })}
    </View>
  )
}
