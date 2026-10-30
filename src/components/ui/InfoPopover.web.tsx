import { useState } from 'react'
import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import InfoPopoverTrigger, {
  infoPopoverHostStyle,
  type InfoPopoverProps,
} from '@/components/ui/InfoPopoverTrigger'
import WebLayer, { useAnchor } from '@/components/ui/web/WebLayer'

const WIDTH = 280

/**
 * Optional help beside a label, opened by a click, Enter or Space and closed by
 * Escape, a click outside or Tab. Hovering shows nothing: a touch screen has no
 * hover, so the help never depends on it.
 */
export default function InfoPopover({
  title,
  description,
  inline,
  ...trigger
}: InfoPopoverProps) {
  const theme = useTheme()
  const [anchor, anchorRef] = useAnchor()
  const [open, setOpen] = useState(false)

  return (
    <View ref={anchorRef} style={infoPopoverHostStyle(inline)}>
      <InfoPopoverTrigger
        title={title}
        {...trigger}
        expanded={open}
        onPress={() => setOpen(!open)}
      />
      <WebLayer
        anchor={anchor}
        open={open}
        onClose={() => setOpen(false)}
        role='dialog'
        label={title}
        placement={{ align: 'start' }}
      >
        <View style={{ width: WIDTH, padding: 12, gap: 4 }}>
          <Text style={{ fontFamily: theme.fonts.semiBold }}>{title}</Text>
          <Text style={{ color: theme.colors.textAlt }}>{description}</Text>
        </View>
      </WebLayer>
    </View>
  )
}
