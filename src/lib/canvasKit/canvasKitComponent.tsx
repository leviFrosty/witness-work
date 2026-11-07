import type { ComponentType, ReactNode } from 'react'

export function canvasKitComponent<P extends object>(
  load: () => ComponentType<P>,

  _fallback?: (props: P) => ReactNode
): ComponentType<P> {
  return function CanvasKitComponent(props: P) {
    const Component = load()
    return <Component {...props} />
  }
}
