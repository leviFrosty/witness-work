import { View } from 'react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { alignText } from '@/lib/direction'
import i18n from '@/lib/locales'
import { formatNumber } from '@/lib/numbers'
import {
  type HouseProgress,
  progressShare,
} from '@/features/territories/lib/houses'
import {
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import type {
  DoorOutcome,
  TerritoryDoor,
} from '@/features/territories/types/territory'

export default function HouseGrid({
  houses,
  doors,
  progress,
  selected,
  descending,
  onPick,
}: {
  houses: readonly string[]
  doors: readonly TerritoryDoor[]
  progress: HouseProgress
  selected?: string
  descending?: boolean
  onPick?: (house: string) => void
}) {
  const theme = useTheme()
  const outcomes = new Map<string, DoorOutcome>(
    doors.map((door) => [door.label.trim().toLowerCase(), door.outcome])
  )
  const ordered = descending ? [...houses].reverse() : houses
  const share = progressShare(progress)

  return (
    <Card testID='house-grid' style={{ gap: 14 }}>
      <View style={{ gap: 8 }}>
        <View
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            gap: 12,
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {i18n.t('territories.houses.title')}
          </Text>
          <Text
            testID='house-progress'
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              flexShrink: 1,
              textAlign: alignText('end'),
            }}
          >
            {i18n.t('territories.houses.progress', {
              visited: formatNumber(progress.visited),
              total: formatNumber(progress.total),
            })}
            {' · '}
            {formatNumber(share, { style: 'percent' })}
          </Text>
        </View>
        <SimpleProgressBar
          percentage={share}
          height={8}
          animated={false}
          color={theme.colors.accent}
        />
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ordered.map((house) => {
          const outcome = outcomes.get(house.toLowerCase())
          const color = outcome
            ? outcomeColor(outcome, theme.colors)
            : undefined
          const filled = outcome !== undefined && outcome !== 'doNotCall'
          const current = selected?.trim().toLowerCase() === house.toLowerCase()
          return (
            <Button
              key={house}
              testID={`house-${house}`}
              disabled={!onPick}
              onPress={() => onPick?.(house)}
              accessibilityLabel={i18n.t('territories.houses.house_a11y', {
                door: house,
                status: outcome
                  ? i18n.t(OUTCOME_LABEL[outcome])
                  : i18n.t('territories.houses.notVisited'),
              })}
              accessibilityState={{ selected: current }}
              style={{
                minWidth: MIN_TOUCH_TARGET + 8,
                height: MIN_TOUCH_TARGET,
                paddingHorizontal: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: MIN_TOUCH_TARGET / 2,
                borderCurve: 'continuous',
                borderWidth: current ? 2.5 : 1.5,
                borderColor: current
                  ? theme.colors.text
                  : (color ?? theme.colors.border),
                backgroundColor: filled
                  ? color
                  : color
                    ? `${color}22`
                    : theme.colors.backgroundLighter,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: filled
                    ? theme.colors.textInverse
                    : outcome === 'doNotCall'
                      ? theme.colors.error
                      : theme.colors.text,
                }}
              >
                {house}
              </Text>
            </Button>
          )
        })}
      </View>

      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
        }}
      >
        {onPick ? `${i18n.t('territories.houses.hint')} ` : ''}
        {i18n.t('territories.houses.attribution')}
      </Text>
    </Card>
  )
}
