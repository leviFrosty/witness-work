import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { ChartColumn as ChartColumnIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import ContextMenu from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
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
import { usePreferences } from '@/stores/preferences'
import { toast } from '@/stores/toasts'
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
  const loadingHidden = usePreferences((s) => s.territoryInsightsLoadingHidden)
  const setPreferences = usePreferences((s) => s.set)

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

  if (!insights.ready) {
    if (loadingHidden) return null

    const hide = () => {
      setPreferences({ territoryInsightsLoadingHidden: true })
      analytics.capture('territory_insights_loading_hidden', {
        source,
        visits: insights.total,
      })
      toast.undo({
        title: i18n.t('territories.insights.hidden'),
        onUndo: () => setPreferences({ territoryInsightsLoadingHidden: false }),
      })
    }

    return (
      <ContextMenu
        accessibilityLabel={title}
        hoverRadius={inputLayout.sectionRadius}
        pointerEffect='none'
        actions={[
          {
            id: 'hide_until_ready',
            title: i18n.t('territories.insights.hideUntilReady'),
            systemImage: 'eye.slash',
            onPress: hide,
          },
        ]}
      >
        <Card
          style={{ gap: 8, paddingVertical: 18 }}
          testID='territory-insights-card'
        >
          {heading(
            <>
              <View style={{ flex: 1, maxWidth: 160, marginLeft: 6 }}>
                <InsightsProgress total={insights.total} />
              </View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  marginRight: -12,
                }}
              >
                <InfoPopover
                  title={title}
                  description={i18n.t(
                    territoryId === undefined
                      ? 'territories.insights.info'
                      : 'territories.insights.territoryInfo'
                  )}
                  inline
                />
                <IconButton
                  icon={XIcon}
                  size={18}
                  color={theme.colors.textAlt}
                  onPress={hide}
                  neighborGap={0}
                  accessibilityLabel={i18n.t(
                    'territories.insights.hideUntilReady_a11y'
                  )}
                  testID='territory-insights-hide'
                  style={{
                    width: 44,
                    height: 44,
                    marginVertical: -10,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                />
              </View>
            </>
          )}
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('territories.insights.needMore', {
              count: insights.remaining,
            })}
          </Text>
        </Card>
      </ContextMenu>
    )
  }

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
          gap: 10,
          paddingHorizontal: 20,
          paddingVertical: 18,
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
