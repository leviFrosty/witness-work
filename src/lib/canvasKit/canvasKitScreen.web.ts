import type { ComponentType } from 'react'
import { loadCanvasKit } from '@/lib/canvasKit/loadCanvasKit'
import { reportCanvasKitFailure } from '@/lib/canvasKit/reportCanvasKitFailure'
import { lazyScreen } from '@/lib/lazyScreen'

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
