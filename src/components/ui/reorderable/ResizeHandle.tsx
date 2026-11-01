import { useEffect, useRef } from 'react'
import { Platform, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Svg, { Defs, Path, RadialGradient, Stop } from 'react-native-svg'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import { isRtlLayout } from '@/lib/direction'
import PointerStyleView, {
  type PointerAccessory,
} from '../../../../modules/pointer-style'

const THICKNESS = 12

const ARC = 19

const PAD = 3

const TARGET = 44

const TAP_SLOP = 6

const TAP_MAX_MS = 500

export default function ResizeHandle({
  label,
  onBegin,
  onDrag,
  onEnd,
  accessories,
}: {
  label: string
  onBegin: () => void

  onDrag: (forward: number, down: number) => void

  onEnd: (tapped: boolean) => void

  accessories: PointerAccessory[]
}) {
  const theme = useTheme()
  const rtl = isRtlLayout()
  const moved = useRef(false)
  const heldSince = useRef<number | null>(null)
  const latestOnEnd = useRef(onEnd)
  useEffect(() => {
    latestOnEnd.current = onEnd
  })

  useEffect(
    () => () => {
      if (heldSince.current !== null) latestOnEnd.current(false)
    },
    []
  )

  const dark = theme.colors.background === '#121212'
  const half = THICKNESS / 2

  const corner = ARC + half + PAD
  const box = corner + half + PAD

  const center = corner - ARC
  const path = `M ${corner} ${center} A ${ARC} ${ARC} 0 0 1 ${center} ${corner}`
  const outside = half + PAD

  const pan = Gesture.Pan()
    .minDistance(0)

    .hitSlop(rtl ? { top: 8, right: 8 } : { top: 8, left: 8 })
    .runOnJS(true)
    .onBegin(() => {
      moved.current = false
      heldSince.current = Date.now()
      onBegin()
    })
    .onUpdate((e) => {
      if (Math.hypot(e.translationX, e.translationY) > TAP_SLOP) {
        moved.current = true
      }
      if (moved.current) {
        onDrag(rtl ? -e.translationX : e.translationX, e.translationY)
      }
    })
    .onFinalize(() => {
      const since = heldSince.current
      heldSince.current = null

      onEnd(!moved.current && since !== null && Date.now() - since < TAP_MAX_MS)
    })

  return (
    <View
      style={{
        position: 'absolute',
        bottom: -outside,
        end: -outside,
        width: box,
        height: box,
        zIndex: 2,
      }}
    >
      <GestureDetector gesture={pan}>
        <PointerStyleView
          accessories={accessories}
          accessible
          accessibilityRole='button'
          accessibilityLabel={label}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => {
            onBegin()
            onEnd(true)
          }}
          style={{
            position: 'absolute',

            bottom: outside - TARGET / 2,
            end: outside - TARGET / 2,
            width: TARGET,
            height: TARGET,
          }}
        >
          <PointerTooltip label={label} style={{ flex: 1 }}>
            <View style={{ flex: 1 }} />
          </PointerTooltip>
        </PointerStyleView>
      </GestureDetector>
      <Svg
        pointerEvents='none'
        width={box}
        height={box}
        style={{
          position: 'absolute',
          top: 0,
          start: 0,
          transform: [{ scaleX: rtl ? -1 : 1 }],

          shadowColor: '#000000',
          shadowOpacity: dark ? 0.4 : 0.16,
          shadowRadius: 3,
          shadowOffset: { width: 0, height: 1 },
        }}
      >
        <Defs>
          {}
          <RadialGradient
            id='resizeHandleGlass'
            gradientUnits='userSpaceOnUse'
            cx={center}
            cy={center}
            r={ARC + half}
          >
            <Stop
              offset={(ARC - half) / (ARC + half)}
              stopColor={dark ? '#8E8E93' : '#FFFFFF'}
            />
            <Stop offset='1' stopColor={dark ? '#48484A' : '#DCDCE0'} />
          </RadialGradient>
        </Defs>
        {Platform.OS === 'android' ? (
          <Path
            d={path}
            stroke='#000000'
            strokeOpacity={dark ? 0.3 : 0.08}
            strokeWidth={THICKNESS + 3}
            strokeLinecap='round'
            fill='none'
            translateY={1}
          />
        ) : null}
        {}
        <Path
          d={path}
          stroke={dark ? '#FFFFFF' : '#000000'}
          strokeOpacity={dark ? 0.2 : 0.14}
          strokeWidth={THICKNESS + 1}
          strokeLinecap='round'
          fill='none'
        />
        <Path
          d={path}
          stroke='url(#resizeHandleGlass)'
          strokeOpacity={0.96}
          strokeWidth={THICKNESS}
          strokeLinecap='round'
          fill='none'
        />
      </Svg>
    </View>
  )
}
