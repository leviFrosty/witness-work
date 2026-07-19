import type { ReactNode } from 'react'
import { useRef, useState } from 'react'
import { Pressable, type StyleProp, View, type ViewStyle } from 'react-native'

import Card from '@/components/ui/Card'
import ExpandingCardOverlay, {
  type ExpandingCardOrigin,
} from '@/components/ui/ExpandingCardOverlay'

interface Props {
  children: ReactNode
  popoverContent: ReactNode | ((props: { close: () => void }) => ReactNode)
  accessibilityLabel: string
  accessibilityHint?: string
  containerStyle?: StyleProp<ViewStyle>
  cardStyle?: StyleProp<ViewStyle>
  expandedHeight?: number
  /** Stretches the trigger and Card to match a sibling in the same row. */
  fill?: boolean
}

/** A normal Card that expands into a detail popover when pressed. */
const PopoverCard = ({
  children,
  popoverContent,
  accessibilityLabel,
  accessibilityHint,
  containerStyle,
  cardStyle,
  expandedHeight,
  fill,
}: Props) => {
  const cardRef = useRef<View>(null)
  const [open, setOpen] = useState(false)
  const [origin, setOrigin] = useState<ExpandingCardOrigin | null>(null)

  const openPopover = () => {
    cardRef.current?.measureInWindow((x, y, width, height) => {
      setOrigin({ x, y, width, height })
      setOpen(true)
    })
  }

  const close = () => setOpen(false)
  const content =
    typeof popoverContent === 'function'
      ? popoverContent({ close })
      : popoverContent

  return (
    <>
      <View
        ref={cardRef}
        collapsable={false}
        style={[containerStyle, fill && { alignSelf: 'stretch' }]}
      >
        <Pressable
          onPress={openPopover}
          accessibilityRole='button'
          accessibilityLabel={accessibilityLabel}
          accessibilityHint={accessibilityHint}
          style={({ pressed }) => [
            fill && { flex: 1 },
            { opacity: pressed ? 0.6 : 1 },
          ]}
        >
          <Card style={[fill && { flex: 1 }, cardStyle]}>{children}</Card>
        </Pressable>
      </View>

      <ExpandingCardOverlay
        origin={origin}
        open={open}
        onClose={close}
        expandedHeight={expandedHeight}
      >
        {content}
      </ExpandingCardOverlay>
    </>
  )
}

export default PopoverCard
