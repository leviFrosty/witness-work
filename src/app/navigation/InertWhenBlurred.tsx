import type { ReactNode } from 'react'
import { Platform, View } from 'react-native'
import { useIsFocused } from '@react-navigation/native'

/**
 * Takes a tab screen out of the page's tab order and accessibility tree while
 * another tab is showing. A browser keeps every tab's screen in the page,
 * stacked under the one on top, so without this Tab walks into the hidden
 * screens, which are still pressable, and scrolls the page to reach them.
 * `inert` keeps the screen laid out, so its scroll position and state stay.
 * Native screens are detached by the system, so there it adds nothing.
 */
export default function InertWhenBlurred({
  children,
}: {
  children: ReactNode
}) {
  const focused = useIsFocused()
  if (Platform.OS !== 'web') return <>{children}</>
  // react-native-web passes `inert` to the DOM; its types don't know it.
  const inert = { inert: !focused } as object
  return (
    <View style={{ flex: 1 }} {...inert}>
      {children}
    </View>
  )
}
