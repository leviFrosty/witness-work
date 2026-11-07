import type {
  FrameEvent,
  FrameParams,
} from '../../../src/lib/turnstileFrame/protocol'

export type TurnstileApi = {
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

      'response-field': false,
    })
  } catch {
    id = null
  }

  emit(id ? { type: 'ready' } : { type: 'error', reason: 'script' })
}
