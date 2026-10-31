import { chunkScriptURL } from '@/vendor/web/trustedTypes'

/**
 * Expo's web chunk loader (`expo/build/async-require/fetchThenEval.web.js`) in
 * an exported build, with one change: the script's URL goes through the Trusted
 * Types policy, which takes only this origin's chunks. Expo's assigns a plain
 * string, which the CSP blocks. Development builds keep Expo's fetch-and-eval
 * for its error overlay; the dev server sends no CSP.
 */

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
    // Throws, rejecting the load, for anything but this origin's chunks.
    script.src = chunkScriptURL(url)
    if (crossOrigin && script.src.indexOf(window.location.origin + '/') !== 0)
      script.crossOrigin = crossOrigin

    script.onload = () => {
      script.parentNode?.removeChild(script)
      resolve()
    }
    // Created here to keep the caller's stack trace.
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
    }

    // Never load and run the entry bundle again.
    if (script.src === currentSrc) resolve()
    else document.head.appendChild(script)
  })
}
