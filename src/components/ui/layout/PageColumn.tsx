import { PropsWithChildren } from 'react'
import { StyleProp, View, ViewStyle } from 'react-native'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import { pageFrameInset, pageLayout } from '@/components/ui/layout/pageLayout'

export function usePageColumnFrame(): StyleProp<ViewStyle> {
  return [pageFrameInset, useFoldColumn(pageLayout.maxWidth)]
}

export default function PageColumn({
  style,
  children,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle> }>) {
  const frame = usePageColumnFrame()
  return (
    <View style={frame}>
      <View
        style={[{ width: '100%', maxWidth: pageLayout.columnMaxWidth }, style]}
      >
        {children}
      </View>
    </View>
  )
}
