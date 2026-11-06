import { Suspense, lazy, useState, type ComponentProps } from 'react'
import type ColorPickerSheetComponent from '@/components/ColorPickerSheet'

const ColorPickerSheet = lazy(() => import('@/components/ColorPickerSheet'))

/**
 * On the web the picker (and `reanimated-color-picker`) downloads the first
 * time it opens, not with the profile card that offers it
 * (docs/web-performance.md); it stays mounted from then on.
 */
export default function ColorPickerSheetOnDemand(
  props: ComponentProps<typeof ColorPickerSheetComponent>
) {
  const [opened, setOpened] = useState(props.visible)
  if (props.visible && !opened) setOpened(true)
  if (!opened) return null
  return (
    <Suspense fallback={null}>
      <ColorPickerSheet {...props} />
    </Suspense>
  )
}
