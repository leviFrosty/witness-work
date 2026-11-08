import { View } from 'react-native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

export default function SettingsRowValue({ value }: { value?: string }) {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      {value ? (
        <Text style={{ color: theme.colors.textAlt, flexShrink: 1 }}>
          {value}
        </Text>
      ) : null}
      <IconButton icon={ChevronForwardIcon} />
    </View>
  )
}
