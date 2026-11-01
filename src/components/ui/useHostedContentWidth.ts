import { useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'

export default function useHostedContentWidth(fitContent: boolean) {
  const [width, setWidth] = useState<number>()
  const [firstPassWidth, setFirstPassWidth] = useState<number>()

  return {
    width,
    overflowed:
      width !== undefined &&
      firstPassWidth !== undefined &&
      firstPassWidth > width,

    onLayout: fitContent
      ? undefined
      : (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width),

    onContentLayout:
      !fitContent && width === undefined
        ? (event: LayoutChangeEvent) =>
            setFirstPassWidth(event.nativeEvent.layout.width)
        : undefined,
  }
}
