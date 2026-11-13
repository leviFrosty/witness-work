import { useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ChartColumn as ChartColumnIcon } from 'lucide-react-native'
import Card from '@/components/ui/Card'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import InfoPopover from '@/components/ui/InfoPopover'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import Header from '@/components/ui/layout/Header'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useNow from '@/hooks/useNow'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import InsightsBars from '@/features/territories/components/insights/InsightsBars'
import InsightsChartCard from '@/features/territories/components/insights/InsightsChartCard'
import InsightsMatrix from '@/features/territories/components/insights/InsightsMatrix'
import InsightsProgress from '@/features/territories/components/insights/InsightsProgress'
import InsightsStat from '@/features/territories/components/insights/InsightsStat'
import TerritorySectionTitle from '@/features/territories/components/TerritorySectionTitle'
import {
  type InsightSlot,
  slotLift,
  territoryInsights,
} from '@/features/territories/lib/insights'
import {
  compareText,
  bucketText,
  dayName,
  dayShort,
  hourLabel,
  hourRange,
  hourTicks,
  liftText,
  percentOf,
  slotText,
  weekOrder,
} from '@/features/territories/lib/insightsText'
import {
  markInsightsSeen,
  useTerritoryVisits,
} from '@/features/territories/stores/territoryVisits'
import type { RootStackParamList } from '@/types/rootStack'

type Chart = 'hour' | 'day' | 'dayAndHour'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryInsights'>

export default function TerritoryInsightsScreen({ route, navigation }: Props) {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { now } = useNow()
  const territoryId = route.params?.territoryId
  const territories = useTerritoryVisits((state) => state.territories)
  const one = territoryId === undefined ? undefined : territories[territoryId]
  const all = Object.entries(territories)
  const insights = territoryInsights(
    territoryId === undefined
      ? all.map(([, tally]) => tally)
      : one
        ? [one]
        : [],
    { now }
  )
  const perTerritory =
    territoryId === undefined
      ? all
          .map(([id, tally]) => ({
            id,
            title: tally.title,
            insights: territoryInsights([tally], { now }),
          }))
          .filter((entry) => entry.insights.total > 0)
          .sort((a, b) => b.insights.total - a.insights.total)
      : []
  const [hourPick, setHourPick] = useState<number | null>(null)
  const [dayPick, setDayPick] = useState<number | null>(null)
  const [slotPick, setSlotPick] = useState<InsightSlot | null>(null)
  const explored = useRef(new Set<Chart>())

  useEffect(() => {
    if (insights.ready && territoryId === undefined) markInsightsSeen()
  }, [insights.ready, territoryId])

  const noteExplored = (chart: Chart) => {
    if (explored.current.has(chart)) return
    explored.current.add(chart)
    analytics.capture('territory_insights_chart_explored', {
      chart,
      scope: territoryId === undefined ? 'all' : 'territory',
    })
  }

  const days = weekOrder()
  const hours = Array.from(
    { length: insights.hours[1] - insights.hours[0] + 1 },
    (_, index) => insights.hours[0] + index
  )
  const { bestDay, bestHour, bestSlot, worstDay, worstHour, worstSlot } =
    insights
  const ticks = hourTicks(insights.hours[0], insights.hours[1])
  const average = insights.rate
  const none = i18n.t('territories.insights.takeaway.none')
  const needVariety = i18n.t('territories.insights.needVariety')
  const sentences = (...parts: (string | false | undefined)[]) =>
    parts.filter(Boolean).join(' ')

  const hourTakeaway =
    bestHour === undefined
      ? none
      : i18n.t('territories.insights.takeaway.hour', {
          time: hourLabel(bestHour),
        })
  const hourDetail =
    bestHour === undefined
      ? needVariety
      : sentences(
          compareText(insights.byHour[bestHour], average),
          worstHour !== undefined &&
            i18n.t('territories.insights.fewestAround', {
              time: hourLabel(worstHour),
            })
        )
  const dayTakeaway =
    bestDay === undefined
      ? none
      : i18n.t('territories.insights.takeaway.day', { day: dayName(bestDay) })
  const dayDetail =
    bestDay === undefined
      ? needVariety
      : sentences(
          compareText(insights.byDay[bestDay], average),
          worstDay !== undefined &&
            i18n.t('territories.insights.fewestOn', { day: dayName(worstDay) })
        )
  const slotTakeaway = bestSlot
    ? i18n.t('territories.insights.takeaway.slot', {
        day: dayName(bestSlot.day),
        time: hourRange(bestSlot.hour),
      })
    : none
  const slotDetail = bestSlot
    ? sentences(
        compareText(insights.grid[bestSlot.day][bestSlot.hour], average),
        worstSlot &&
          i18n.t('territories.insights.fewestOn', { day: slotText(worstSlot) })
      )
    : needVariety

  const hourReadout =
    hourPick === null
      ? null
      : `${hourRange(hours[hourPick] ?? 0)} · ${bucketText(insights.byHour[hours[hourPick] ?? 0])}`
  const dayReadout =
    dayPick === null
      ? null
      : `${dayName(days[dayPick] ?? 0)} · ${bucketText(insights.byDay[days[dayPick] ?? 0])}`
  const slotReadout =
    slotPick === null
      ? null
      : [
          slotText(slotPick),
          bucketText(insights.grid[slotPick.day][slotPick.hour]),
          liftText(
            slotLift(insights.grid[slotPick.day][slotPick.hour], average)
          ),
        ]
          .filter(Boolean)
          .join(' · ')

  const chartLabel = (title: string, takeaway: string, detail: string) =>
    i18n.t('territories.insights.chart_a11y', { title, takeaway, detail })

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Header buttonType='back' title={i18n.t('territories.insights.title')} />
      <ScrollView>
        <ContentColumn
          style={{
            padding: inputLayout.horizontalPadding,
            paddingBottom: insets.bottom + 30,
            gap: 16,
          }}
        >
          {one && (
            <Text
              accessibilityRole='header'
              style={{
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('lg'),
                paddingHorizontal: 4,
              }}
            >
              {one.title}
            </Text>
          )}
          {!insights.ready ? (
            <Card style={{ gap: 12 }} testID='insights-not-ready'>
              <LucideIcon
                icon={ChartColumnIcon}
                size={24}
                color={theme.colors.textAlt}
              />
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
          ) : (
            <>
              <Card style={{ gap: 16 }} testID='insights-summary'>
                <View style={{ gap: 4 }}>
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: theme.fontSize('sm'),
                        color: theme.colors.textAlt,
                      }}
                    >
                      {i18n.t('territories.insights.bestReturn')}
                    </Text>
                    <InfoPopover
                      title={i18n.t('territories.insights.bestReturn')}
                      description={i18n.t('territories.insights.weighting')}
                      inline
                    />
                  </View>
                  <Text
                    accessibilityRole='header'
                    style={{
                      fontFamily: theme.fonts.bold,
                      fontSize: theme.fontSize('xl'),
                    }}
                  >
                    {bestSlot
                      ? slotText(bestSlot)
                      : i18n.t('territories.insights.notEnough')}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 16 }}>
                  <InsightsStat
                    label={i18n.t('territories.insights.bestDay')}
                    value={
                      bestDay === undefined
                        ? i18n.t('territories.insights.notEnough')
                        : dayName(bestDay)
                    }
                  />
                  <InsightsStat
                    label={i18n.t('territories.insights.bestTime')}
                    value={
                      bestHour === undefined
                        ? i18n.t('territories.insights.notEnough')
                        : hourLabel(bestHour)
                    }
                  />
                </View>
                <Text
                  style={{
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {[
                    i18n.t('territories.insights.summary', {
                      count: insights.total,
                      percent: percentOf(insights.rate),
                    }),
                    insights.leansOnPast &&
                      i18n.t('territories.insights.leansOnPast'),
                  ]
                    .filter(Boolean)
                    .join('\n')}
                </Text>
              </Card>

              <InsightsChartCard
                title={i18n.t('territories.insights.byHour')}
                info={i18n.t('territories.insights.byHour_info')}
                takeaway={hourTakeaway}
                detail={hourDetail}
                readout={hourReadout}
                testID='insights-by-hour'
              >
                <InsightsBars
                  label={chartLabel(
                    i18n.t('territories.insights.byHour'),
                    hourTakeaway,
                    hourDetail
                  )}
                  bars={hours.map((hour) => ({
                    key: String(hour),
                    bucket: insights.byHour[hour],
                    tick: ticks.get(hour),
                    best: hour === bestHour,
                  }))}
                  picked={hourPick}
                  onPick={(index) => {
                    setHourPick(index)
                    if (index !== null) noteExplored('hour')
                  }}
                />
              </InsightsChartCard>

              <InsightsChartCard
                title={i18n.t('territories.insights.byDay')}
                info={i18n.t('territories.insights.byDay_info')}
                takeaway={dayTakeaway}
                detail={dayDetail}
                readout={dayReadout}
                testID='insights-by-day'
              >
                <InsightsBars
                  label={chartLabel(
                    i18n.t('territories.insights.byDay'),
                    dayTakeaway,
                    dayDetail
                  )}
                  bars={days.map((day) => ({
                    key: String(day),
                    bucket: insights.byDay[day],
                    tick: dayShort(day),
                    best: day === bestDay,
                  }))}
                  picked={dayPick}
                  onPick={(index) => {
                    setDayPick(index)
                    if (index !== null) noteExplored('day')
                  }}
                />
              </InsightsChartCard>

              <InsightsChartCard
                title={i18n.t('territories.insights.byDayAndHour')}
                info={i18n.t('territories.insights.byDayAndHour_info')}
                takeaway={slotTakeaway}
                detail={slotDetail}
                readout={slotReadout}
                testID='insights-by-day-and-hour'
              >
                <InsightsMatrix
                  label={chartLabel(
                    i18n.t('territories.insights.byDayAndHour'),
                    slotTakeaway,
                    slotDetail
                  )}
                  grid={insights.grid}
                  average={insights.rate}
                  days={days}
                  hours={insights.hours}
                  picked={slotPick}
                  onPick={(slot) => {
                    setSlotPick(slot)
                    if (slot !== null) noteExplored('dayAndHour')
                  }}
                />
              </InsightsChartCard>

              <Text
                style={{
                  fontSize: theme.fontSize('sm'),
                  color: theme.colors.textAlt,
                  textAlign: 'center',
                  paddingHorizontal: 8,
                }}
              >
                {i18n.t('territories.insights.touchToExplore')}
              </Text>
            </>
          )}
          {perTerritory.length > 1 && (
            <View style={{ gap: 8 }} testID='insights-by-territory'>
              <TerritorySectionTitle
                info={i18n.t('territories.insights.byTerritory_info')}
              >
                {i18n.t('territories.insights.byTerritory')}
              </TerritorySectionTitle>
              <Section>
                {perTerritory.map((entry, index) => (
                  <InputRowButton
                    key={entry.id}
                    label={entry.title}
                    sublabel={[
                      entry.insights.ready && entry.insights.bestSlot
                        ? i18n.t('territories.insights.bestShort', {
                            slot: slotText(entry.insights.bestSlot),
                          })
                        : i18n.t('territories.insights.checkBackLater'),
                      i18n.t('territories.insights.summary', {
                        count: entry.insights.total,
                        percent: percentOf(entry.insights.rate),
                      }),
                    ].join('\n')}
                    onPress={() => {
                      analytics.capture('territory_insights_opened', {
                        source: 'list',
                      })
                      navigation.push('TerritoryInsights', {
                        territoryId: entry.id,
                      })
                    }}
                    lastInSection={index === perTerritory.length - 1}
                    style={{ paddingTop: 12, paddingBottom: 12 }}
                  >
                    <LucideIcon
                      icon={ChevronForwardIcon}
                      size={14}
                      color={theme.colors.textAlt}
                    />
                  </InputRowButton>
                ))}
              </Section>
            </View>
          )}
        </ContentColumn>
      </ScrollView>
    </View>
  )
}
