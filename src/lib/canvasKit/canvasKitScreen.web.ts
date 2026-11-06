import type { ComponentType } from 'react'
import { loadCanvasKit } from '@/lib/canvasKit/loadCanvasKit'
import { reportCanvasKitFailure } from '@/lib/canvasKit/reportCanvasKitFailure'
import { lazyScreen } from '@/lib/lazyScreen'

/**
 * On the web: the screen, made once, opens after CanvasKit and its own chunk
 * have loaded. Without them (no WebGL, a failed download) or if it throws, it
 * shows `lazyScreen`'s way back instead and reports once. See
 * `canvasKitScreen.ts`.
 */
export function canvasKitScreen<P extends object>(
  load: () => ComponentType<P> | Promise<ComponentType<P>>
): () => ComponentType<P> {
  const Screen = lazyScreen<P>(
    async () => {
      await loadCanvasKit()
      return load()
    },
    { onError: reportCanvasKitFailure }
  )
  return () => Screen
}
