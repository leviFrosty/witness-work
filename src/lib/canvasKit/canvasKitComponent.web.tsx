import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import FallbackOnError from '@/lib/canvasKit/FallbackOnError'
import { loadCanvasKit } from '@/lib/canvasKit/loadCanvasKit'
import { reportCanvasKitFailure } from '@/lib/canvasKit/reportCanvasKitFailure'

export function canvasKitComponent<P extends object>(
  load: () => ComponentType<P> | Promise<ComponentType<P>>,
  fallback?: (props: P) => ReactNode
): ComponentType<P> {
  const Loaded = lazy(async () => {
    await loadCanvasKit()
    return { default: await load() }
  })
  return function CanvasKitComponent(props: P) {
    const waiting = fallback?.(props) ?? null
    return (
      <FallbackOnError fallback={waiting} onError={reportCanvasKitFailure}>
        <Suspense fallback={waiting}>
          <Loaded {...props} />
        </Suspense>
      </FallbackOnError>
    )
  }
}
