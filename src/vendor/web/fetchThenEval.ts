import { onChunkLoadFailed } from '@/lib/webOffline/staleChunk'
import { chunkScriptURL } from '@/vendor/web/trustedTypes'

const currentSrc =
  typeof document !== 'undefined' && document.currentScript
    ? ('src' in document.currentScript && document.currentScript.src) || null
    : null

class AsyncRequireError extends Error {
  readonly name = 'AsyncRequireError'
  type?: string
  request?: string
}

export function fetchThenEvalAsync(
  url: string,
  {
    scriptType,
    nonce,
    crossOrigin,
  }: { scriptType?: string; nonce?: string; crossOrigin?: string } = {}
): Promise<void> {
  if (typeof window === 'undefined' || __DEV__)
    return require('expo/build/async-require/fetchThenEvalJs').fetchThenEvalAsync(
      url
    )
  return new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    if (scriptType) script.type = scriptType
    if (nonce) script.setAttribute('nonce', nonce)

    script.src = chunkScriptURL(url)
    if (crossOrigin && script.src.indexOf(window.location.origin + '/') !== 0)
      script.crossOrigin = crossOrigin

    script.onload = () => {
      script.parentNode?.removeChild(script)
      resolve()
    }

    const error = new AsyncRequireError()
    script.onerror = (event) => {
      const type =
        typeof event === 'string'
          ? 'error'
          : event.type === 'load'
            ? 'missing'
            : event.type
      error.message = `Loading module ${url} failed.\n(${type}: ${script.src})`
      error.type = type
      error.request = script.src
      script.parentNode?.removeChild(script)
      reject(error)

      void onChunkLoadFailed(url)
    }

    if (script.src === currentSrc) resolve()
    else document.head.appendChild(script)
  })
}
