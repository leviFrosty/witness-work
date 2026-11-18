import type { ComponentProps } from 'react'
import { DefaultTheme, NavigationContainer } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import type { RootStackParamList } from '@/types/rootStack'

export default function AppNavigationContainer(
  props: ComponentProps<typeof NavigationContainer<RootStackParamList>>
) {
  const theme = useTheme()
  return (
    <NavigationContainer
      {...props}
      theme={{
        ...DefaultTheme,
        colors: { ...DefaultTheme.colors, background: theme.colors.background },
      }}
    />
  )
}
