import { Info } from 'lucide-react-native'
import { useRef } from 'react'
import { Pressable, useWindowDimensions, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import AnchoredPopover from '@/components/ui/AnchoredPopover'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/**
 * Optional help directly after a label, with no gap on the parent row. The icon
 * starts 6pt from the label; the rest of its 44pt tap target extends rightward.
 * Keep values, essential instructions, and help inside existing detail popovers
 * inline; don't nest an InfoPopover inside another popover.
 */
const InfoPopover = ({
  title,
  description,
  inline = false,
}: {
  title: string
  description: string
  /** Keep the 44pt target without making a text line 44pt tall. */
  inline?: boolean
}) => {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const headingRef = useRef<View>(null)

  return (
    <AnchoredPopover
      contentWidth={Math.min(300, width - insets.left - insets.right - 24)}
      accessibilityFocusRef={headingRef}
      resolvePosition={({
        anchor,
        windowWidth,
        windowHeight,
        contentWidth,
      }) => {
        const topEdge = insets.top + 12
        const bottomEdge = windowHeight - insets.bottom - 12
        const below = Math.max(0, bottomEdge - anchor.y - anchor.height - 8)
        const above = Math.max(0, anchor.y - 8 - topEdge)
        const left = Math.max(
          insets.left + 12,
          Math.min(anchor.x, windowWidth - insets.right - contentWidth - 12)
        )
        return below >= above
          ? { left, top: anchor.y + anchor.height + 8, maxHeight: below }
          : { left, bottom: windowHeight - anchor.y + 8, maxHeight: above }
      }}
      contentStyle={{ gap: 8 }}
      renderTrigger={({ onPress, anchorRef, expanded }) => (
        <Pressable
          ref={anchorRef}
          collapsable={false}
          onPress={onPress}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('infoPopoverLabel', { title })}
          accessibilityState={{ expanded }}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            marginVertical: inline ? -12 : 0,
            flexShrink: 0,
            alignItems: 'flex-start',
            paddingLeft: 6,
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <LucideIcon
            icon={Info}
            size={theme.fontSize('md')}
            color={theme.colors.textAlt}
          />
        </Pressable>
      )}
    >
      <View
        ref={headingRef}
        accessible
        accessibilityRole='header'
        accessibilityLabel={title}
      >
        <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
      </View>
      <Text style={{ fontSize: theme.fontSize('sm') }}>{description}</Text>
    </AnchoredPopover>
  )
}

export default InfoPopover
