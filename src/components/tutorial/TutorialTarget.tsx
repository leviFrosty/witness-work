import React, { useEffect, useRef } from 'react'
import { View, ViewProps } from 'react-native'
import { useOptionalTutorialContext } from '../../providers/TutorialProvider'

interface Props extends ViewProps {
  /** Stable id referenced by tutorial step `targetId`. */
  id: string
  children: React.ReactNode
}

/**
 * Thin wrapper that registers its underlying view with the tutorial provider by
 * id, so spotlight steps can measure it. Pass-through styles — the wrapper adds
 * no visual layout of its own (uses `contents`-like behavior by default via
 * flex shrink 0 + no padding).
 *
 * When no provider is mounted, behaves as a plain View.
 */
export const TutorialTarget: React.FC<Props> = ({
  id,
  children,
  style,
  ...rest
}) => {
  const viewRef = useRef<View>(null)
  const ctx = useOptionalTutorialContext()

  useEffect(() => {
    if (!ctx) return
    const handle = { ref: viewRef }
    return ctx.registerTarget(id, handle)
  }, [ctx, id])

  return (
    <View ref={viewRef} collapsable={false} style={style} {...rest}>
      {children}
    </View>
  )
}
