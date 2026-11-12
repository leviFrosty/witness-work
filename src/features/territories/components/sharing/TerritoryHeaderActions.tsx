import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import type { AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'

export type TerritoryHeaderActionItem = {
  icon: AppIcon
  label: string
  onPress: () => void
  testID: string
}

export default function TerritoryHeaderActions({
  actions,
}: {
  actions: TerritoryHeaderActionItem[]
}) {
  if (actions.length === 0) return null
  return (
    <View
      style={{
        position: 'absolute',
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {actions.map((action) => (
        <PointerTooltip key={action.testID} label={action.label} effect='none'>
          <IconButton
            frame
            neighborGap={12}
            icon={action.icon}
            size={22}
            onPress={action.onPress}
            accessibilityLabel={action.label}
            testID={action.testID}
          />
        </PointerTooltip>
      ))}
    </View>
  )
}
