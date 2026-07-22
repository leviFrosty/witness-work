import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

import ExpandingCardOverlay, {
  type ExpandingCardOrigin,
} from '@/components/ui/ExpandingCardOverlay'

interface Props {
  children: ReactNode
  content: ReactNode | ((props: { close: () => void }) => ReactNode)
  accessibilityLabel: string
  accessibilityHint?: string
  containerStyle?: StyleProp<ViewStyle>
  expandedHeight?: number
}

/**
 * Adds the expanding-card interaction to a flat cell inside the shared Service
 * Report card without introducing a nested Card surface.
 */
const ServiceReportInsightOverlay = ({
  children,
  content,
  accessibilityLabel,
  accessibilityHint,
  containerStyle,
  expandedHeight,
}: Props) => {
  const triggerRef = useRef<View>(null)
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<ExpandingCardOrigin | null>(null)

  const show = () => {
    triggerRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setOpen(true)
    })
  }
  const close = () => setOpen(false)
  const overlayContent =
    typeof content === 'function' ? content({ close }) : content

  return (
    <>
      <View
        ref={triggerRef}
        collapsable={false}
        style={[{ alignSelf: 'stretch' }, containerStyle]}
      >
        <Pressable
          onPress={show}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          style={({ pressed }) => ({ flex: 1, opacity: pressed ? 0.6 : 1 })}
        >
          {children}
        </Pressable>
      </View>

      <ExpandingCardOverlay
        origin={origin}
        open={open}
        onClose={close}
        expandedHeight={expandedHeight}
      >
        {overlayContent}
      </ExpandingCardOverlay>
    </>
  )
}

export default ServiceReportInsightOverlay
