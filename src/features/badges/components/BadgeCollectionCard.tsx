import type { ReactNode } from 'react'
import { View } from 'react-native'
import BadgeButton from '@/components/badges/BadgeButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import {
  badgeDescription,
  badgeLevelName,
  badgeName,
} from '@/lib/badges/display'
import { BADGE_LEVELS, BadgeCollectionId, BadgeLevel } from '@/types/badges'
import type { BadgeViewOrigin } from '@/types/rootStack'

const MEDALLION_SIZE = 56

export default function BadgeCollectionCard({
  art,
  level,
  isNew,
  footer,
  onOpen,
}: {
  art: BadgeCollectionId

  level: BadgeLevel | 0

  isNew?: (level: BadgeLevel) => boolean
  footer?: ReactNode
  onOpen: (level: BadgeLevel, origin: BadgeViewOrigin | undefined) => void
}) {
  const theme = useTheme()
  return (
    <Card style={{ paddingVertical: 16, paddingHorizontal: 16, gap: 14 }}>
      <View style={{ gap: 2 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              flex: 1,
              fontSize: 16,
              fontFamily: theme.fonts.semiBold,
              color: theme.colors.text,
            }}
          >
            {badgeName(art)}
          </Text>
          {level > 0 ? (
            <Text
              style={{
                fontSize: 12,
                fontFamily: theme.fonts.medium,
                color: theme.colors.textAlt,
              }}
            >
              {badgeLevelName(level as BadgeLevel)}
            </Text>
          ) : null}
        </View>
        {level > 0 ? (
          <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
            {badgeDescription(art, level as BadgeLevel)}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {BADGE_LEVELS.map((step) => {
          const earned = step <= level
          return (
            <View
              key={step}
              style={{ alignItems: 'center', gap: 6, minWidth: 64 }}
            >
              <BadgeButton
                art={art}
                level={step}
                size={MEDALLION_SIZE}
                state={earned ? 'earned' : 'locked'}
                isNew={isNew?.(step) ?? false}
                onPress={(origin) => onOpen(step, origin)}
              />
              <Text
                importantForAccessibility='no'
                accessibilityElementsHidden
                style={{
                  fontSize: 11,
                  fontFamily: earned ? theme.fonts.medium : theme.fonts.regular,
                  color: earned ? theme.colors.text : theme.colors.textAlt,
                }}
              >
                {badgeLevelName(step)}
              </Text>
            </View>
          )
        })}
      </View>

      {footer}
    </Card>
  )
}
