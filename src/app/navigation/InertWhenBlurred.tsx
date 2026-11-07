import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

export default function InertWhenBlurred({
  children,
}: {
  children: ReactNode
}) {
  const focused = useIsFocused()
  if (Platform.OS !== 'web') return <>{children}</>

  const inert = { inert: !focused } as object
  return (
    <View style={{ flex: 1 }} {...inert}>
      {children}
    </View>
  )
}
