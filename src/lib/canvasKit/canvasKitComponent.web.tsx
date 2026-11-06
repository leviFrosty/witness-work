import { Suspense, lazy, type ComponentType, type ReactNode } from 'react'
import FallbackOnError from '@/lib/canvasKit/FallbackOnError'
import { loadCanvasKit } from '@/lib/canvasKit/loadCanvasKit'
import { reportCanvasKitFailure } from '@/lib/canvasKit/reportCanvasKitFailure'

/**
 * On the web: loads CanvasKit, then the component's chunk, showing `fallback`
 * (nothing by default) meanwhile. It stays on the fallback, and reports once,
 * when the browser has no WebGL, either download fails, or the canvas throws,
 * so the screen around it keeps working. See `canvasKitComponent.tsx`.
 */
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
