import { useEffect, useId, useRef, useState } from 'react'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { useTakeoverHold } from '@/hooks/useTakeoverTurn'
import useTheme from '@/contexts/theme'
import { PopoverContent } from '@/components/ui/popoverPresentation'
import WebLayer, { useAnchor } from '@/components/ui/web/WebLayer'
import type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

export type {
  PopoverControls,
  PopoverProps,
} from '@/components/ui/Popover.types'

/**
 * Content anchored to its trigger, opened by a click, Enter or Space: a dialog
 * panel (`web/WebLayer.tsx`) that closes on Escape or a click outside, and
 * keeps Tab inside while it's open.
 */
export default function Popover({
  renderTrigger,
  style,
  contentWidth,
  contentStyle,
  backgroundColor,
  children,
}: PopoverProps) {
  const theme = useTheme()
  const navigation = useNavigation()
  const [anchor, anchorRef] = useAnchor()
  const contentRef = useRef<View>(null)
  const afterClose = useRef<(() => void) | null>(null)
  const [open, setOpen] = useState(false)
  const holdId = useId()
  useTakeoverHold(`popover:${holdId}`, open)

  // Actions that present something wait until the panel is gone.
  useEffect(() => {
    if (open) return
    const then = afterClose.current
    afterClose.current = null
    then?.()
  }, [open])

  // A popover left open while its screen navigates away would sit over the
  // next one.
  useEffect(
    () => navigation.addListener('blur', () => setOpen(false)),
    [navigation]
  )

  const controls: PopoverControls = {
    close: () => setOpen(false),
    closeThen: (action) => {
      afterClose.current = action
      setOpen(false)
    },
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={style}>
        {renderTrigger({ onPress: () => setOpen(!open), expanded: open })}
      </View>
      <WebLayer
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        role='dialog'
        trapFocus
        style={{ backgroundColor: backgroundColor ?? theme.colors.card }}
      >
        <PopoverContent
          contentRef={contentRef}
          width={contentWidth}
          style={contentStyle}
          controls={controls}
          onLayout={() => {}}
        >
          {typeof children === 'function' ? children(controls) : children}
        </PopoverContent>
      </WebLayer>
    </>
  )
}
