import type { StyleProp, TextStyle } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { useProfile } from '@/stores/profile'
import useBuddiesEnabled from '@/features/buddies/hooks/useBuddiesEnabled'
import { useBuddies } from '@/features/buddies/stores/buddiesStore'

export default function BuddiesAccountNameHint({
  style,
}: {
  style?: StyleProp<TextStyle>
}) {
  const theme = useTheme()
  const enabled = useBuddiesEnabled()
  const accountName = useBuddies((state) => state.cardName?.name)
  const profileName = useProfile((state) => state.name.trim())
  if (!enabled || !accountName || accountName === profileName) return null
  return (
    <Text style={[{ color: theme.colors.textAlt }, style]}>
      {i18n.t('buddies_accountNameHint', { name: accountName })}
    </Text>
  )
}
