import { useRef } from 'react'
import { View } from 'react-native'
import BadgeMedallion from '@/components/badges/BadgeMedallion'
import {
  badgeAccessibilityLabel,
  measureBadgeOrigin,
} from '@/components/badges/BadgeButton'
import Button from '@/components/ui/Button'
import { useCardStyle } from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { earnedLabel } from '@/features/badges/lib/badgeText'
import {
  BadgeShelfEntry,
  badgeDescription,
  badgeName,
  isNewBadge,
} from '@/lib/badges/display'
import i18n from '@/lib/locales'
import type { EarnedBadge, OneTimeBadgeId } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'

const MEDALLION_SIZE = 48

/** Earned One-time Badges: single moments, each a row that opens its detail. */
export default function BadgeMomentsSection({
  entries,
  seenAt,
  onOpen,
}: {
  entries: Extract<BadgeShelfEntry, { kind: 'oneTime' }>[]
  seenAt: number
  onOpen: (art: OneTimeBadgeId, origin: BadgeViewOrigin | undefined) => void
}) {
  const theme = useTheme()
  if (entries.length === 0) return null
  return (
    <View style={{ gap: 10 }}>
      <Text
        accessibilityRole='header'
        style={{
          fontSize: 13,
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          letterSpacing: 0.5,
          marginLeft: 4,
        }}
      >
        {i18n.t('badges_moments')}
      </Text>
      {entries.map(({ art, record }) => (
        <MomentRow
          key={art}
          art={art}
          record={record}
          isNew={isNewBadge(record, seenAt)}
          onOpen={(origin) => onOpen(art, origin)}
        />
      ))}
    </View>
  )
}

function MomentRow({
  art,
  record,
  isNew,
  onOpen,
}: {
  art: OneTimeBadgeId
  record: EarnedBadge
  isNew: boolean
  onOpen: (origin: BadgeViewOrigin | undefined) => void
}) {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const coin = useRef<View>(null)
  const when = earnedLabel(record)
  return (
    <Button
      onPress={() => measureBadgeOrigin(coin.current, onOpen)}
      accessibilityRole='button'
      accessibilityLabel={`${badgeAccessibilityLabel(art, null, { isNew })}, ${badgeDescription(art, null)}, ${when}`}
      style={{
        ...cardStyle,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        padding: 14,
      }}
    >
      <View ref={coin} collapsable={false}>
        <BadgeMedallion art={art} level={null} size={MEDALLION_SIZE} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text
            style={{
              fontSize: 15,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
              flexShrink: 1,
            }}
          >
            {badgeName(art)}
          </Text>
          {isNew ? (
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: theme.colors.accent,
              }}
            />
          ) : null}
        </View>
        <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
          {badgeDescription(art, null)}
        </Text>
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {when}
        </Text>
      </View>
    </Button>
  )
}
