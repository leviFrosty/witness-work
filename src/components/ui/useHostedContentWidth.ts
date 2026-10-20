import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

/**
 * Hosted RN content (`RNHostView`) sizes to its own content, so a context menu
 * passes the width the surrounding layout gives it down to the content, unless
 * the content is meant to keep its own width.
 *
 * Hosted content lays out once before that width arrives. When it ran wider
 * than the width then (a long label, a large text size), its text keeps that
 * one-line layout instead of wrapping and runs off the edge; `overflowed` says
 * to remount the Host at the width.
 */
export default function useHostedContentWidth(fitContent: boolean) {
  const [width, setWidth] = useState<number>()
  const [firstPassWidth, setFirstPassWidth] = useState<number>()

  return {
    width,
    overflowed:
      width !== undefined &&
      firstPassWidth !== undefined &&
      firstPassWidth > width,
    /** For the view around the Host. */
    onLayout: fitContent
      ? undefined
      : (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),
    /** For the hosted content's root. */
    onContentLayout:
      !fitContent && width === undefined
        ? (event: LayoutChangeEvent) =>
            setFirstPassWidth(event.nativeEvent.layout.width)
        : undefined,
  }
}
