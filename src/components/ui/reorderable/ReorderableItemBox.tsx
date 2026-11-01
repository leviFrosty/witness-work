import { type ReactNode, useContext, useRef } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'
import { ReorderableItemContext } from '@/components/ui/reorderable/context'

export default function ReorderableItemBox({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const item = useContext(ReorderableItemContext)
  const ref = useRef<View>(null)
  return (
    <View
      ref={ref}
      collapsable={false}
      style={style}
      onLayout={() => {
        if (ref.current) item?.measureBox(ref.current)
      }}
    >
      {children}
    </View>
  )
}
