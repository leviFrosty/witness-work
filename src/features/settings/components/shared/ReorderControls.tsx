import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export default function ReorderControls({ onMoveUp, onMoveDown }: Props) {
  const theme = useTheme()

  return (
    <View style={{ flexDirection: 'row', gap: 6, flexShrink: 0 }}>
      {[
        { icon: ArrowUp, onPress: onMoveUp, label: i18n.t('moveUp') },
        { icon: ArrowDown, onPress: onMoveDown, label: i18n.t('moveDown') },
      ].map(({ icon, onPress, label }) => (
        <IconButton
          key={label}
          icon={icon}
          onPress={onPress}
          accessibilityLabel={label}
          hitSlop={0}
          size={16}
          style={{
            width: 44,
            height: 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          color={onPress ? theme.colors.textAlt : theme.colors.border}
        />
      ))}
    </View>
  )
}
