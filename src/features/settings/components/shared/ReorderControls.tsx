import { ArrowDown, ArrowUp } from 'lucide-react-native'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  onMoveUp?: () => void
  onMoveDown?: () => void
}

// Visible button is 36pt; a 4pt hitSlop on every side brings the tap target
// to 44pt. The 8pt gap keeps adjacent slops from overlapping (see IconButton).
const BUTTON_SIZE = 36
const HIT_SLOP = 4

export default function ReorderControls({ onMoveUp, onMoveDown }: Props) {
  const theme = useTheme()

  return (
    <View style={{ flexDirection: 'row', gap: HIT_SLOP * 2, flexShrink: 0 }}>
      {[
        { icon: ArrowUp, onPress: onMoveUp, label: i18n.t('moveUp') },
        { icon: ArrowDown, onPress: onMoveDown, label: i18n.t('moveDown') },
      ].map(({ icon, onPress, label }) => (
        <IconButton
          key={label}
          icon={icon}
          onPress={onPress}
          accessibilityLabel={label}
          hitSlop={HIT_SLOP}
          size={16}
          style={{
            width: BUTTON_SIZE,
            height: BUTTON_SIZE,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.backgroundLightest,
            opacity: onPress ? 1 : 0.4,
          }}
          color={theme.colors.textAlt}
        />
      ))}
    </View>
  )
}
