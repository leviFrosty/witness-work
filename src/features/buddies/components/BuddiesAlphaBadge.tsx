import { Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Badge from '@/components/ui/Badge'
import PointerHover from '@/components/ui/PointerHover'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

export default function BuddiesAlphaBadge() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <PointerHover effect='highlight'>
      <Pressable
        accessibilityRole='button'
        accessibilityLabel={i18n.t('buddies_alphaA11y')}
        hitSlop={10}
        onPress={() =>
          navigation.navigate('Buddies Feedback', { source: 'badge' })
        }
        style={{ borderRadius: theme.numbers.borderRadiusLg }}
      >
        <Badge
          color={theme.colors.accentTranslucent}
          size='xs'
          textStyle={{ color: theme.colors.accent }}
        >
          {i18n.t('alpha')}
        </Badge>
      </Pressable>
    </PointerHover>
  )
}
