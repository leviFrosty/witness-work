import type { ReactNode } from 'react'
import { View } from 'react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import InputRowButton from '@/components/ui/inputs/InputRowButton'

export default function AccountNavRow({
  icon,
  label,
  value,
  onPress,
  lastInSection,
  testID,
}: {
  icon: AppIcon
  label: string
  value?: ReactNode
  onPress: () => void
  lastInSection?: boolean
  testID?: string
}) {
  return (
    <InputRowButton
      leftIcon={icon}
      label={label}
      onPress={onPress}
      lastInSection={lastInSection}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        {value}
        <IconButton icon={ChevronForwardIcon} />
      </View>
    </InputRowButton>
  )
}
