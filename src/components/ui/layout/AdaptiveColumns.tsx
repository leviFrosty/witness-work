import { Children, PropsWithChildren } from 'react'
import { View, ViewProps } from 'react-native'
import FoldSplit from '@/components/ui/layout/FoldSplit'

/**
 * Independent stacks let short cards follow one another without row-height
 * gaps. The two stacks meet at iPhone Duo's fold while it's partly folded.
 */
export default function AdaptiveColumns({
  children,
  wide,
  gap = 20,
  style,
  ...props
}: PropsWithChildren<ViewProps & { wide: boolean; gap?: number }>) {
  const sections = Children.toArray(children)
  const column = (index: number) => (
    <View style={{ gap }}>
      {sections.filter((_, section) => section % 2 === index)}
    </View>
  )

  if (!wide)
    return (
      <View {...props} style={[{ flex: 1, gap }, style]}>
        {children}
      </View>
    )

  return (
    <View {...props} style={[{ flex: 1 }, style]}>
      <FoldSplit
        gap={gap}
        leadingFraction={0.5}
        leading={column(0)}
        trailing={column(1)}
      />
    </View>
  )
}
