// Draws the Turnstile widget and turns its callbacks into frame events
// (docs/web-turnstile.md). `frame.ts` passes the real `api.js` loader; the
// tests a fake one.
import type {
  FrameEvent,
  FrameParams,
} from '../../../src/lib/turnstileFrame/protocol'

export type TurnstileApi = {
  /** The widget's id, or nothing when it couldn't render. */
  render: (
    container: HTMLElement,
    options: {
      sitekey: string
      action: string
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
      'timeout-callback': () => void
      theme: 'auto' | 'light' | 'dark'
      size: 'normal' | 'flexible' | 'compact'
      'response-field': boolean
    }
  ) => string | null | undefined
}

export async function renderWidget({
  load,
  element,
  params,
  emit,
}: {
  load: () => Promise<TurnstileApi>
  element: HTMLElement
  params: FrameParams
  emit: (event: FrameEvent) => void
}): Promise<void> {
  let id: string | null | undefined
  try {
    const turnstile = await load()
    id = turnstile.render(element, {
      sitekey: params.siteKey,
      action: params.action,
      callback: (token) => emit({ type: 'token', token }),
      'expired-callback': () => emit({ type: 'expired' }),
      'error-callback': () => emit({ type: 'error', reason: 'check' }),
      'timeout-callback': () => emit({ type: 'timeout' }),
      theme: 'auto',
      size: 'flexible',
      // No hidden input: the token goes to the app, never into a form.
      'response-field': false,
    })
  } catch {
    id = null
  }
  // No widget id: nothing rendered, so there's nothing to wait for.
  emit(id ? { type: 'ready' } : { type: 'error', reason: 'script' })
}
