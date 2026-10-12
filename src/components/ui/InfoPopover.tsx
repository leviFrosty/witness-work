import { View } from 'react-native'
import InfoPopoverTrigger, {
  infoPopoverHostStyle,
  type InfoPopoverProps,
} from '@/components/ui/InfoPopoverTrigger'

/**
 * Optional help directly after a label, with no gap on the parent row: a
 * SwiftUI popover on iOS (`InfoPopover.ios.tsx`), a Material rich tooltip on
 * Android (`InfoPopover.android.tsx`). The icon starts 6pt from the label; the
 * rest of its 44pt tap target extends rightward. Beside a control rather than a
 * label, `centered` centers the icon in its target so it doesn't leave a wide
 * gutter after it. Keep values, essential instructions, and help inside
 * existing detail popovers inline; don't nest an InfoPopover inside another
 * popover.
 */
export default function InfoPopover({
  title,
  inline,
  centered,
  color,
}: InfoPopoverProps) {
  return (
    <View style={infoPopoverHostStyle(inline)}>
      <InfoPopoverTrigger
        title={title}
        centered={centered}
        color={color}
        onPress={() => {}}
      />
    </View>
  )
}
