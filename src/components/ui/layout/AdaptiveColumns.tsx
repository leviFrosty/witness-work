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

/**
 * One column, or two that read in the same order: the first sections fill the
 * leading column and the rest continue in the trailing one, split where the two
 * come out closest in height. Opening iPhone Duo keeps what was on screen in
 * the order it was read, and the columns meet at its fold while it's partly
 * folded.
 */
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
    /** In one column, the last section sits at the bottom of the space. */
    bottomAnchorLast?: boolean
    /** Each section's cell, by its key, e.g. to keep it in view. */
    sectionRef?: (key: string) => Ref<View>
  }
>) {
  const sections = Children.toArray(children)
  const keys = sections.map((section, index) =>
    isValidElement(section) && section.key !== null
      ? String(section.key)
      : String(index)
  )
  // Heights as last laid out, in either layout; columns are about as wide.
  const [heights, setHeights] = useState<Record<string, number>>({})
  const split = wide
    ? splitInReadingOrder(
        keys.map((key) => heights[key]),
        gap
      )
    : sections.length

  // Each section in a view of its own, keyed, so the leading column's keep
  // their place (and state) as the trailing column comes and goes.
  const cells = sections.map((section, index) => {
    const key = keys[index]
    const empty = heights[key] === 0
    const column = index < split ? 0 : 1
    const first = column === 0 ? 0 : split
    // Sections that draw nothing (nothing to show today) leave no gap.
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
