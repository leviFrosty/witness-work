import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import BadgeRow from '@/components/badges/BadgeRow'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import useTheme from '@/contexts/theme'
import { badgeTitle } from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import type { RootStackNavigation } from '@/types/rootStack'

export default function ProfileCardBadges({
  badges,
}: {
  badges: readonly { art: BadgeArtId; level: BadgeLevel | null }[]
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <Button
      onPress={() => navigation.navigate('Badges', { source: 'profile_card' })}
      accessibilityRole='button'
      accessibilityLabel={i18n.t('badges_rowLabel' as TranslationKey, {
        count: badges.length,
        names: badges
          .map(({ art, level }) => badgeTitle(art, level))
          .join(', '),
      })}
      accessibilityHint={i18n.t('badges_openHint')}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 8,
        marginTop: 2,
        marginHorizontal: -6,
        paddingHorizontal: 6,
        paddingVertical: 4,
        borderRadius: theme.numbers.borderRadiusMd,
      }}
    >
      {}
      <View
        accessibilityElementsHidden
        importantForAccessibility='no-hide-descendants'
      >
        <BadgeRow badges={badges} />
      </View>
      <LucideIcon
        icon={ChevronForwardIcon}
        size={14}
        color={theme.colors.textAlt}
      />
    </Button>
  )
}
