import { Heart as HeartIcon } from 'lucide-react-native'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import useIsSupporter from '@/hooks/useIsSupporter'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'

type Props = {
  /** Paywall attribution, reported on `paywall_viewed`. */
  source: string
}

/**
 * A quiet one-line mention of Supporter for moments when someone has just
 * gotten value from the app. Hidden for supporters and anyone who turned off
 * the donate heart.
 */
const SupporterNote = ({ source }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { isSupporter } = useIsSupporter()
  const { hideDonateHeart } = usePreferences()

  if (isSupporter || hideDonateHeart) return null

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.supporterTranslucent,
      }}
    >
      <LucideIcon
        icon={HeartIcon}
        size={14}
        color={theme.colors.supporter}
        fill={theme.colors.supporter}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
          lineHeight: theme.fontSize('sm') * 1.4,
        }}
      >
        {i18n.t('supporterNote_body')}
      </Text>
      <Button
        onPress={() => navigation.navigate('Paywall', { source })}
        hitSlop={8}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.supporter,
          }}
        >
          {i18n.t('learnMore')}
        </Text>
      </Button>
    </View>
  )
}

export default SupporterNote
