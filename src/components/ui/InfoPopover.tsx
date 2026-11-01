import { View } from 'react-native'
import InfoPopoverTrigger, {
  infoPopoverHostStyle,
  type InfoPopoverProps,
} from '@/components/ui/InfoPopoverTrigger'

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
