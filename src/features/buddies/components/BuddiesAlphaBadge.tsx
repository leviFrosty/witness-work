import { Pressable } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import Badge from '@/components/ui/Badge'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { RootStackNavigation } from '@/types/rootStack'

/** Sets Alpha expectations; opens the feedback screen that explains it. */
export default function BuddiesAlphaBadge() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()

  return (
    <Pressable
      accessibilityRole='button'
      accessibilityLabel={i18n.t('buddies_alphaA11y')}
      hitSlop={10}
      onPress={() =>
        navigation.navigate('Buddies Feedback', { source: 'badge' })
      }
    >
      <Badge
        color={theme.colors.accentTranslucent}
        size='xs'
        textStyle={{ color: theme.colors.accent }}
      >
        {i18n.t('alpha')}
      </Badge>
    </Pressable>
  )
}
