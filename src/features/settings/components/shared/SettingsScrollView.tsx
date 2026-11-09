import { type ComponentProps, createContext, useContext, useRef } from 'react'
import type { ScrollView, View } from 'react-native'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { inputLayout } from '@/components/ui/inputs/InputLayout'

const gutter = inputLayout.horizontalPadding

type SettingsScrollContextValue = {
  reveal: (row: View, animated: boolean) => void
}

const SettingsScrollContext = createContext<SettingsScrollContextValue | null>(
  null
)

export const useSettingsScroll = () => useContext(SettingsScrollContext)

type Props = Omit<
  ComponentProps<typeof KeyboardAwareScrollView>,
  'innerRef'
> & {
  innerRef?: (node: ScrollView | null) => void
}

export default function SettingsScrollView({
  innerRef,
  onLayout,
  style,
  contentContainerStyle,
  ...props
}: Props) {
  const scrollRef = useRef<ScrollView | null>(null)
  const viewportHeight = useRef(0)

  const reveal: SettingsScrollContextValue['reveal'] = (row, animated) => {
    const scroll = scrollRef.current
    const content = scroll?.getInnerViewRef()
    if (!scroll || !content) return
    row.measureLayout(
      content,
      (_x, y, _width, height) => {
        const centered = y - Math.max(0, (viewportHeight.current - height) / 2)
        scroll.scrollTo({ y: Math.max(0, centered), animated })
      },
      () => {}
    )
  }

  return (
    <SettingsScrollContext value={{ reveal }}>
      <KeyboardAwareScrollView
        {...props}
        style={[style, { marginHorizontal: -gutter }]}
        contentContainerStyle={[
          contentContainerStyle,
          { paddingHorizontal: gutter },
        ]}
        innerRef={(node) => {
          const scroll = node as unknown as ScrollView | null
          scrollRef.current = scroll
          innerRef?.(scroll)
        }}
        onLayout={(event) => {
          viewportHeight.current = event.nativeEvent.layout.height
          onLayout?.(event)
        }}
      />
    </SettingsScrollContext>
  )
}
