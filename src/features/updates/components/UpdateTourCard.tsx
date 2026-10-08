import Constants from 'expo-constants'
import semver from 'semver'
import { useNavigation } from '@react-navigation/native'
import {
  ChevronRight as ChevronRightIcon,
  Gift as GiftIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { withAlpha } from '@/lib/color'
import { RootStackNavigation } from '@/types/rootStack'
import {
  UPDATE_REVEAL_NAME,
  UPDATE_REVEAL_VERSION,
} from '@/features/updates/constants/updateReveal'
import { useUpdateRevealStore } from '@/features/updates/stores/updateReveal'

/**
 * Replays the update reveal from What's New, once this install has the update
 * it belongs to (always in development, to preview it).
 */
const UpdateTourCard = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const requestReveal = useUpdateRevealStore((s) => s.request)
  const version = Constants.expoConfig?.version
  if (!__DEV__ && (!version || semver.lt(version, UPDATE_REVEAL_VERSION))) {
    return null
  }

  return (
    <Button
      accessibilityRole='button'
      onPress={() => {
        // The reveal draws over the tabs, so come back to them first.
        navigation.navigate('Root', undefined, { pop: true })
        requestReveal('whats_new')
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        padding: 14,
        marginBottom: 24,
        borderRadius: theme.numbers.borderRadiusLg,
        borderWidth: 1,
        borderColor: withAlpha(theme.colors.accent, 0x66),
        backgroundColor: theme.colors.accentTranslucent,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          backgroundColor: theme.colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={GiftIcon}
          size={19}
          color={theme.colors.textInverse}
        />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
            color: theme.colors.text,
          }}
        >
          {i18n.t(UPDATE_REVEAL_NAME)}
        </Text>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('updateReveal_tourCard')}
        </Text>
      </View>
      <LucideIcon
        icon={ChevronRightIcon}
        size={18}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}

export default UpdateTourCard
