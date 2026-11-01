import {
  Children,
  isValidElement,
  PropsWithChildren,
  type Ref,
  useState,
} from 'react'
import { View, ViewProps } from 'react-native'
import FoldSplit from '@/components/ui/layout/FoldSplit'
import { splitInReadingOrder } from '@/lib/columnSplit'

export default function AdaptiveColumns({
  children,
  wide,
  gap = 20,
  bottomAnchorLast = false,
  sectionRef,
  style,
  ...props
}: PropsWithChildren<
  ViewProps & {
    wide: boolean
    gap?: number

    bottomAnchorLast?: boolean

    sectionRef?: (key: string) => Ref<View>
  }
>) {
  const sections = Children.toArray(children)
  const keys = sections.map((section, index) =>
    isValidElement(section) && section.key !== null
      ? String(section.key)
      : String(index)
  )

  const [heights, setHeights] = useState<Record<string, number>>({})
  const split = wide
    ? splitInReadingOrder(
        keys.map((key) => heights[key]),
        gap
      )
    : sections.length

  const cells = sections.map((section, index) => {
    const key = keys[index]
    const empty = heights[key] === 0
    const column = index < split ? 0 : 1
    const first = column === 0 ? 0 : split

    const spaced =
      !empty && keys.slice(first, index).some((other) => heights[other] !== 0)
    return (
      <View
        key={key}
        ref={sectionRef?.(key)}
        collapsable={false}
        onLayout={(e) => {
          const height = e.nativeEvent.layout.height
          setHeights((current) =>
            current[key] === height ? current : { ...current, [key]: height }
          )
        }}
        style={[
          spaced ? { marginTop: gap } : null,
          !wide && bottomAnchorLast && index === sections.length - 1
            ? { marginTop: 'auto', paddingTop: spaced ? gap : 0 }
            : null,
        ]}
      >
        {section}
      </View>
    )
  })

  return (
    <View {...props} style={[{ flex: 1 }, style]}>
      <FoldSplit
        style={{ flex: 1 }}
        gap={gap}
        leadingFraction={0.5}
        leading={<View style={{ flex: 1 }}>{cells.slice(0, split)}</View>}
        trailing={wide ? <View>{cells.slice(split)}</View> : undefined}
      />
    </View>
  )
}
