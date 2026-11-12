import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  ChevronDown as ChevronDownIcon,
  CircleCheckBig as CircleCheckIcon,
} from 'lucide-react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function TerritoryMapRow({
  icon,
  label,
  sublabel,
  done,
  value,
  preview,
  opens,
  onPress,
  lastInSection,
  testID,
}: {
  icon: AppIcon
  label: string
  sublabel?: string
  done: boolean
  value?: string
  preview?: ReactNode

  opens: 'screen' | 'expanded' | 'collapsed'
  onPress: () => void
  lastInSection?: boolean
  testID: string
}) {
  const theme = useTheme()
  const chevron = opens === 'expanded' ? ChevronDownIcon : ChevronForwardIcon
  return (
    <InputRowButton
      leftIcon={icon}
      label={label}
      sublabel={sublabel}
      checked={done}
      onPress={onPress}
      lastInSection={lastInSection}
      testID={testID}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {value !== undefined && (
          <Text
            testID={`${testID}-value`}
            numberOfLines={1}
            style={{ color: theme.colors.textAlt, maxWidth: 140 }}
          >
            {value}
          </Text>
        )}
        {preview}
        {done && (
          <View testID={`${testID}-done`}>
            <LucideIcon
              icon={CircleCheckIcon}
              size={20}
              color={theme.colors.accent}
            />
          </View>
        )}
        <LucideIcon icon={chevron} size={18} color={theme.colors.textAlt} />
      </View>
    </InputRowButton>
  )
}
