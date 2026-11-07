import type { ComponentType } from 'react'

export const canvasKitScreen = <P extends object>(
  load: () => ComponentType<P>
): (() => ComponentType<P>) => load
