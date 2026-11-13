import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChartColumn as ChartColumnIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InfoPopover from '@/components/ui/InfoPopover'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import InsightsProgress from '@/features/territories/components/insights/InsightsProgress'
import InsightsStat from '@/features/territories/components/insights/InsightsStat'
import { territoryInsights } from '@/features/territories/lib/insights'
import {
  dayName,
  hourLabel,
  percentOf,
} from '@/features/territories/lib/insightsText'
import { useTerritoryTallies } from '@/features/territories/stores/territoryVisits'
import useNow from '@/hooks/useNow'
import type { RootStackNavigation } from '@/types/rootStack'

export default function TerritoryInsightsCard({
  territoryId,
}: {
  territoryId?: string
}) {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { now } = useNow()
  const tallies = useTerritoryTallies(territoryId)
  const insights = territoryInsights(tallies, { now })
  const title = i18n.t('territories.insights.title')
  const source = territoryId === undefined ? 'card' : 'territory'

  if (territoryId !== undefined && insights.total === 0) return null

  const heading = (trailing: React.ReactNode) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        minHeight: 24,
      }}
    >
      <LucideIcon
        icon={ChartColumnIcon}
        size={20}
        color={theme.colors.accent}
      />
      <Text
        accessibilityRole='header'
        style={{
          fontFamily: theme.fonts.semiBold,
          color: theme.colors.textAlt,
        }}
      >
        {title}
      </Text>
      <View style={{ flex: 1 }} />
      {trailing}
    </View>
  )

  if (!insights.ready)
    return (
      <Card style={{ gap: 10 }} testID='territory-insights-card'>
        {heading(
          <InfoPopover
            title={title}
            description={i18n.t(
              territoryId === undefined
                ? 'territories.insights.info'
                : 'territories.insights.territoryInfo'
            )}
            inline
          />
        )}
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('territories.insights.checkBackLater')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('territories.insights.needMore', {
            count: insights.remaining,
          })}
        </Text>
        <InsightsProgress total={insights.total} />
      </Card>
    )

  const notEnough = i18n.t('territories.insights.notEnough')
  return (
    <Card style={{ padding: 0, paddingVertical: 0, paddingHorizontal: 0 }}>
      <Button
        noTransform
        testID='territory-insights-card'
        accessibilityHint={i18n.t('territories.insights.open_hint')}
        onPress={() => {
          analytics.capture('territory_insights_opened', { source })
          navigation.navigate('TerritoryInsights', { territoryId })
        }}
        style={{
          gap: 14,
          padding: 20,
          borderRadius: inputLayout.sectionRadius,
          borderCurve: 'continuous',
        }}
      >
        {heading(
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.textAlt}
          />
        )}
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <InsightsStat
            label={i18n.t('territories.insights.bestDay')}
            value={
              insights.bestDay === undefined
                ? notEnough
                : dayName(insights.bestDay)
            }
          />
          <InsightsStat
            label={i18n.t('territories.insights.bestTime')}
            value={
              insights.bestHour === undefined
                ? notEnough
                : hourLabel(insights.bestHour)
            }
          />
        </View>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('territories.insights.summary', {
            count: insights.total,
            percent: percentOf(insights.rate),
          })}
        </Text>
      </Button>
    </Card>
  )
}
