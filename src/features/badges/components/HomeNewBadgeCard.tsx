import { StyleProp, View, ViewStyle } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { X as XIcon } from 'lucide-react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import { analytics } from '@/lib/analytics'
import { parseBadgeKey } from '@/lib/badges/catalog'
import {
  badgeDescription,
  badgeTitle,
  homeCardBadges,
} from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import { useBadgeSession } from '@/stores/badgeSession'
import { usePreferences } from '@/stores/preferences'
import type { RootStackNavigation } from '@/types/rootStack'

const COIN_SIZE = 52

/**
 * The quiet way a badge arrives (ADR 0021): when nothing the User just did
 * earned it, it doesn't take over the screen. This card at the top of Home
 * names the newest one instead; View opens it full screen, and the X lets it
 * go. Either way it's settled for good (`badgeCardDismissed`), and the badge
 * stays New on the profile and the Badges screen until those are opened.
 * Renders nothing with Show badges off. Only the User's own badges: buddies'
 * news lives in the notification bell.
 */
export default function HomeNewBadgeCard({
  style,
}: {
  style?: StyleProp<ViewStyle>
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { now } = useNow()
  const earned = usePreferences((s) => s.earnedBadges)
  const seenAt = usePreferences((s) => s.badgesSeenAt)
  const dismissed = usePreferences((s) => s.badgeCardDismissed)
  const showBadges = usePreferences((s) => s.showBadges)
  const waiting = useBadgeSession((s) => s.celebrations)
  if (!showBadges) return null

  const keys = homeCardBadges({ earned, seenAt, dismissed, waiting, now })
  const lead = keys[0] ? parseBadgeKey(keys[0]) : null
  if (!lead) return null
  const title = badgeTitle(lead.art, lead.level)
  const more = keys.length - 1

  const close = (action: 'view' | 'dismiss') => {
    usePreferences.getState().dismissBadgeCard(keys)
    analytics.capture('badge_card_closed', { action, count: keys.length })
    if (action === 'view')
      navigation.navigate('BadgeView', { badgeKey: keys[0], owner: 'me' })
  }

  return (
    <Card style={[{ gap: 10 }, style]}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('xs'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
            textTransform: 'uppercase',
            letterSpacing: 1,
          }}
        >
          {i18n.t('badges_newBadge')}
        </Text>
        <IconButton
          icon={XIcon}
          size={18}
          hitSlop={12}
          color={theme.colors.textAlt}
          accessibilityLabel={i18n.t('dismiss')}
          onPress={() => close('dismiss')}
        />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <BadgeMedallion art={lead.art} level={lead.level} size={COIN_SIZE} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: theme.fontSize('lg'),
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={2}
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {more > 0
              ? i18n.t('badges_andMore' as TranslationKey, { count: more })
              : badgeDescription(lead.art, lead.level)}
          </Text>
        </View>
        <Button
          accessibilityRole='button'
          accessibilityLabel={i18n.t('badges_cardView', { title })}
          onPress={() => close('view')}
          style={{
            minHeight: 36,
            paddingHorizontal: 16,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 18,
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.accent,
            }}
          >
            {i18n.t('view')}
          </Text>
        </Button>
      </View>
    </Card>
  )
}
