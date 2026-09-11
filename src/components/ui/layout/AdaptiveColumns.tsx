import { Children, PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'

/**
 * Independent stacks let short cards follow one another without row-height
 * gaps.
 */
export default function AdaptiveColumns({
  children,
  wide,
  gap = 20,
  style,
  ...props
}: PropsWithChildren<ViewProps & { wide: boolean; gap?: number }>) {
  const sections = Children.toArray(children)

  return (
    <View
      {...props}
      style={[{ flex: 1, gap, flexDirection: wide ? 'row' : 'column' }, style]}
    >
      {wide
        ? [0, 1].map((column) => (
            <View key={column} style={{ flex: 1, minWidth: 0, gap }}>
              {sections.filter((_, index) => index % 2 === column)}
            </View>
          ))
        : children}
    </View>
  )
}
