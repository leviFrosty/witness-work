import {
  parseFrameParams,
  type FrameParams,
} from '../../../src/lib/turnstileFrame/protocol'
import { TURNSTILE_ORIGIN } from './headers'
import { createVerifyController } from './controller'
import { renderWidget, type TurnstileApi } from './widget'

declare const WW_VERIFY_APP_ORIGINS: readonly string[]

const SCRIPT_URL = `${TURNSTILE_ORIGIN}/turnstile/v0/api.js?render=explicit`

function loadTurnstile(): Promise<TurnstileApi> {
  const page = window as unknown as { turnstile?: TurnstileApi }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SCRIPT_URL
    script.async = true
    script.onload = () =>
      page.turnstile ? resolve(page.turnstile) : reject(new Error('turnstile'))
    script.onerror = () => reject(new Error('turnstile'))
    document.head.appendChild(script)
  })
}

export function startFrame(
  params: FrameParams | null = parseFrameParams(location.search),
  allowedOrigins: readonly string[] = WW_VERIFY_APP_ORIGINS
) {
  if (window.parent === window || !params) return
  const controller = createVerifyController({
    allowedOrigins,
    parent: window.parent,
    action: params.action,
  })
  window.addEventListener('message', (event) =>
    controller.receive({
      origin: event.origin,
      source: event.source,
      data: event.data,
    })
  )
  void renderWidget({
    load: loadTurnstile,
    element: document.getElementById('widget')!,
    params,
    emit: controller.emit,
  })
  return controller
}

if (typeof WW_VERIFY_APP_ORIGINS !== 'undefined') startFrame()
