import { Suspense, lazy, useState, type ComponentProps } from 'react'
import type ColorPickerSheetComponent from '@/components/ColorPickerSheet'

const ColorPickerSheet = lazy(() => import('@/components/ColorPickerSheet'))

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
