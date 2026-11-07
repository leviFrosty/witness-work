let loading: Promise<void> | undefined

export const isCanvasKitLoaded = () =>
  (globalThis as { CanvasKit?: unknown }).CanvasKit !== undefined

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
    if (!gl) return false

    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

const WASM = '/canvaskit.wasm'

async function load(): Promise<void> {
  if (!hasWebGL()) throw new Error('This browser has no WebGL')

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
