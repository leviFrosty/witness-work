import { type ComponentProps, type ReactNode, useState } from 'react'
import { View } from 'react-native'
import ReorderableContainer from '@/components/ui/reorderable/ReorderableContainer'
import ReorderableItem, {
  type ReorderableResize,
} from '@/components/ui/reorderable/ReorderableItem'

export type ReorderableGridItem<Id extends string, Size extends string> = {
  id: Id
  size: Size
}

export type ReorderableGridResize<Size extends string> = Omit<
  ReorderableResize<Size>,
  'options' | 'size'
> & {
  options: { size: Size; height?: number }[]
}

type ItemProps<Size extends string> = Omit<
  ComponentProps<typeof ReorderableItem<Size>>,
  'id' | 'children' | 'style' | 'fill' | 'resize'
> & { resize?: ReorderableGridResize<Size> }

type Props<Id extends string, Size extends string> = Omit<
  ComponentProps<typeof ReorderableContainer<Id>>,
  'children'
> & {
  items: ReorderableGridItem<Id, Size>[]

  span: (size: Size) => number
  columns?: number

  minWidth?: number

  gap?: number
  renderItem: (item: ReorderableGridItem<Id, Size>) => ReactNode
  itemProps?: (item: ReorderableGridItem<Id, Size>) => ItemProps<Size>

  layoutKey?: string
}

export default function ReorderableGrid<
  Id extends string,
  Size extends string,
>({
  items,
  span,
  columns = 2,
  minWidth = 0,
  gap = 12,
  renderItem,
  itemProps,
  layoutKey,
  ...container
}: Props<Id, Size>) {
  const half = gap / 2
  const [width, setWidth] = useState(0)
  const fits = width === 0 || width - gap >= minWidth
  const shown = fits ? columns : 1
  const spanOf = (size: Size) => Math.min(shown, Math.max(1, span(size)))

  const widthAt = (size: Size) =>
    width ? (width * spanOf(size)) / shown - gap : undefined

  return (
    <ReorderableContainer {...container}>
      <View
        key={layoutKey}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', flexWrap: 'wrap', margin: -half }}
      >
        {items.map((item) => {
          const { resize, ...rest } = itemProps?.(item) ?? {}
          return (
            <ReorderableItem
              key={item.id}
              id={item.id}
              fill
              style={{
                width: `${(spanOf(item.size) / shown) * 100}%`,
                padding: half,
              }}
              resize={
                resize
                  ? {
                      ...resize,
                      size: item.size,
                      options: resize.options.map((option) => ({
                        ...option,
                        width: widthAt(option.size),
                      })),
                    }
                  : undefined
              }
              {...rest}
            >
              {renderItem(item)}
            </ReorderableItem>
          )
        })}
      </View>
    </ReorderableContainer>
  )
}
