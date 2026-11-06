/**
 * Skia's CanvasKit on the web: an 8 MB wasm (about 3 MB compressed) that
 * downloads the first time something draws with Skia, never at launch
 * (docs/web-performance.md). `scripts/web.mjs` serves `canvaskit.wasm` from the
 * web root. Skia's modules bind to CanvasKit as they load, so they may load
 * only after this resolves: `canvasKitComponent` and `canvasKitScreen` see to
 * that, and show their fallbacks when it rejects.
 *
 * Skia draws through WebGL, so a browser without it (hardware acceleration off,
 * some locked-down machines) never downloads CanvasKit. A failed download isn't
 * retried until the page reloads.
 */
let loading: Promise<void> | undefined

export const isCanvasKitLoaded = () =>
  (globalThis as { CanvasKit?: unknown }).CanvasKit !== undefined

/** Whether this browser gives a page WebGL. */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false
    // Browsers keep a few contexts at most; give this one back.
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

const WASM = '/canvaskit.wasm'

async function load(): Promise<void> {
  if (!hasWebGL()) throw new Error('This browser has no WebGL')
  // Downloaded here first: CanvasKit's own loader, when its download fails,
  // aborts with an error nothing can catch. It then reads the file from the
  // service worker's cache, or revalidates the browser's copy.
  const response = await fetch(WASM)
  if (!response.ok)
    throw new Error(`CanvasKit didn't download (${response.status})`)
  await response.arrayBuffer()
  const { LoadSkiaWeb } = await import(
    '@shopify/react-native-skia/lib/module/web'
  )
  await LoadSkiaWeb({ locateFile: () => WASM })
}

export function loadCanvasKit(): Promise<void> {
  loading ??= load()
  return loading
}
