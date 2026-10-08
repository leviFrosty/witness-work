import { View } from 'react-native'
import BadgeButton from '@/components/badges/BadgeButton'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import InfoPopover from '@/components/ui/InfoPopover'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { badgeTitle } from '@/lib/badges/display'
import i18n, { TranslationKey } from '@/lib/locales'
import type { BadgeArtId, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'

const MEDALLION_SIZE = 104
/**
 * InfoPopover's tap target runs 44pt right of the label but its icon only
 * ~20pt; the same space on the left keeps the label and icon centered.
 */
const POPOVER_BALANCE = 24

/**
 * The top of the User's collection: the newest badge, large, and how many
 * they've earned. The "months, not hours" note waits in an info popover.
 */
export default function BadgesHero({
  newest,
  count,
  newestIsNew,
  onOpenNewest,
}: {
  newest: { art: BadgeArtId; level: BadgeLevel | null } | undefined
  /** Every earned level counts. */
  count: number
  newestIsNew: boolean
  onOpenNewest: (origin: BadgeViewOrigin | undefined) => void
}) {
  const theme = useTheme()
  return (
    <View style={{ alignItems: 'center', gap: 12, paddingVertical: 8 }}>
      {newest ? (
        <BadgeButton
          art={newest.art}
          level={newest.level}
          size={MEDALLION_SIZE}
          isNew={newestIsNew}
          dotBorderColor={theme.colors.background}
          onPress={onOpenNewest}
        />
      ) : (
        <View
          accessibilityElementsHidden
          importantForAccessibility='no-hide-descendants'
        >
          <BadgeMedallion
            art='monthsShared'
            level={1}
            size={MEDALLION_SIZE}
            state='locked'
          />
        </View>
      )}
      <View style={{ alignItems: 'center', gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: POPOVER_BALANCE,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              fontSize: 22,
              fontFamily: theme.fonts.bold,
              color: theme.colors.text,
            }}
          >
            {count > 0
              ? i18n.t('badges_count' as TranslationKey, { count })
              : i18n.t('badges_emptyTitle')}
          </Text>
          <InfoPopover
            title={i18n.t('badges_title')}
            description={i18n.t('badges_infoBody')}
          />
        </View>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.textAlt,
            textAlign: 'center',
          }}
        >
          {newest
            ? i18n.t('badges_newest', {
                title: badgeTitle(newest.art, newest.level),
              })
            : i18n.t('badges_emptyInvite')}
        </Text>
      </View>
    </View>
  )
}
