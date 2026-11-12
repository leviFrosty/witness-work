import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import type { AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'

export default function TerritoryHeaderAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: AppIcon
  label: string
  onPress: () => void
  testID?: string
}) {
  return (
    <View style={{ position: 'absolute', right: 0 }}>
      <PointerTooltip label={label} effect='none'>
        <IconButton
          frame
          icon={icon}
          size={22}
          onPress={onPress}
          accessibilityLabel={label}
          testID={testID}
        />
      </PointerTooltip>
    </View>
  )
}
