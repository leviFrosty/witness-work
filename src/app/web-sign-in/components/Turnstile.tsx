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

  onError: (reason: TurnstileErrorReason) => void

  onReady?: () => void

  onExpired?: () => void
}) {
  const frame = useRef<HTMLIFrameElement>(null)
  const bridge = useRef<ReturnType<typeof createTurnstileBridge> | null>(null)
  const token = useEffectEvent(onToken)
  const failed = useEffectEvent(onError)
  const up = useEffectEvent(() => onReady?.())
  const expired = useEffectEvent(() => onExpired?.())

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
