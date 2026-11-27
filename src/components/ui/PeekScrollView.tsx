import { type ReactNode, type Ref, useId, useRef, useState } from 'react'
import { ScrollView, type StyleProp, View, type ViewStyle } from 'react-native'
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg'

const FADE_HEIGHT = 12

type Props = {
  ref?: Ref<ScrollView>

  height: number | undefined

  fadeColor: string
  children: ReactNode
  contentContainerStyle?: StyleProp<ViewStyle>
  onContentSizeChange?: (width: number, height: number) => void
  testID?: string
}

export default function PeekScrollView({
  ref,
  height,
  fadeColor,
  children,
  contentContainerStyle,
  onContentSizeChange,
  testID,
}: Props) {
  const metrics = useRef({ viewport: 0, content: 0, offset: 0 })
  const [fades, setFades] = useState({ above: false, below: false })

  const syncFades = () => {
    const { viewport, content, offset } = metrics.current
    const above = offset > 1
    const below = offset < content - viewport - 1
    setFades((prev) =>
      prev.above === above && prev.below === below ? prev : { above, below }
    )
  }

  const scrolls = height !== undefined
  const moreAbove = scrolls && fades.above
  const moreBelow = scrolls && fades.below

  return (
    <View style={{ height, overflow: 'hidden' }}>
      <ScrollView
        ref={ref}
        testID={testID}
        nestedScrollEnabled
        scrollEnabled={scrolls}
        bounces={false}
        overScrollMode='never'
        scrollEventThrottle={16}
        onLayout={(e) => {
          metrics.current.viewport = e.nativeEvent.layout.height
          syncFades()
        }}
        onContentSizeChange={(w, h) => {
          metrics.current.content = h
          syncFades()
          onContentSizeChange?.(w, h)
        }}
        onScroll={(e) => {
          metrics.current.offset = e.nativeEvent.contentOffset.y
          syncFades()
        }}
        contentContainerStyle={contentContainerStyle}
      >
        {children}
      </ScrollView>
      {moreAbove && <EdgeFade edge='top' color={fadeColor} />}
      {moreBelow && <EdgeFade edge='bottom' color={fadeColor} />}
    </View>
  )
}

function EdgeFade({ edge, color }: { edge: 'top' | 'bottom'; color: string }) {
  const id = `peekFade${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const [atStart, atEnd] = edge === 'top' ? ['0.6', '0'] : ['0', '0.6']
  return (
    <View
      pointerEvents='none'
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        height: FADE_HEIGHT,
        ...(edge === 'top' ? { top: 0 } : { bottom: 0 }),
      }}
    >
      <Svg width='100%' height='100%'>
        <Defs>
          <LinearGradient id={id} x1='0' y1='0' x2='0' y2='1'>
            <Stop offset='0' stopColor={color} stopOpacity={atStart} />
            <Stop offset='1' stopColor={color} stopOpacity={atEnd} />
          </LinearGradient>
        </Defs>
        <Rect width='100%' height='100%' fill={`url(#${id})`} />
      </Svg>
    </View>
  )
}
