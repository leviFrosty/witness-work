import { Clock3 as ClockIcon, X as XIcon } from 'lucide-react-native'
import moment from 'moment'
import type { ReactNode } from 'react'
import { type StyleProp, View, type ViewStyle } from 'react-native'

import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import ServiceReportInsightOverlay from '@/features/service-reports/components/ServiceReportInsightOverlay'
import useMonthlyGoal from '@/hooks/useMonthlyGoal'
import useProjectedTotal from '@/hooks/useProjectedTotal'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import useScheduleStatusPresentation from '@/hooks/useScheduleStatusPresentation'
import { goalProgress } from '@/lib/goalProgress'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { calculateMonthlyPlannedMinutesOptimized } from '@/lib/recurrence'
import useServiceReport from '@/stores/serviceReport'

const InsightStat = ({
  label,
  value,
  sub,
}: {
  label: string
  value: string
  sub?: string
}) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        padding: 14,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
        gap: 4,
      }}
    >
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('xs'),
          textTransform: 'uppercase',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('xl'),
        }}
      >
        {value}
      </Text>
      {sub ? (
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: theme.fontSize('xs'),
          }}
        >
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

const TimeInsightContent = ({ onClose }: { onClose: () => void }) => {
  const theme = useTheme()
  const now = moment()
  const month = now.month()
  const year = now.year()
  const { effectiveGoalHours } = useMonthlyGoal({ month, year })
  const goalMinutes = Math.round(effectiveGoalHours * 60)
  const { projection } = useProjectedTotal(
    { kind: 'month', month, year },
    goalMinutes
  )
  const dayPlans = useServiceReport((state) => state.dayPlans)
  const recurringPlans = useServiceReport((state) => state.recurringPlans)
  const plannedMinutes = calculateMonthlyPlannedMinutesOptimized(
    month,
    year,
    dayPlans,
    recurringPlans
  )
  const scheduleStatus = useScheduleStatus({ month, year })
  const schedulePresentation = useScheduleStatusPresentation(scheduleStatus)
  const timeProgress =
    goalMinutes > 0
      ? goalProgress({
          minutes: projection.loggedMinutes,
          goalMinutes,
        })
      : null

  const logged = useFormattedMinutes(projection.loggedMinutes)
  const goal = useFormattedMinutes(goalMinutes)
  const planned = useFormattedMinutes(plannedMinutes)
  const projected = useFormattedMinutes(projection.projectedMinutes)
  const ofGoal =
    goalMinutes > 0
      ? i18n.t('serviceReportInsights.ofGoal', { goal: goal.formatted })
      : undefined

  return (
    <>
      <View style={{ position: 'relative', minHeight: 58 }}>
        <IconButton
          icon={XIcon}
          size='lg'
          onPress={onClose}
          accessibilityLabel={i18n.t('close')}
          style={{ position: 'absolute', top: -6, right: -6, zIndex: 1 }}
        />
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 14,
            paddingRight: 38,
          }}
        >
          <View
            style={{
              width: 54,
              height: 54,
              borderRadius: 27,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.accentTranslucent,
            }}
          >
            <LucideIcon
              icon={ClockIcon}
              size={24}
              color={theme.colors.accent}
            />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text
              accessibilityRole='header'
              style={{
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('md'),
              }}
            >
              {now.format('MMMM YYYY')}
            </Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('3xl'),
              }}
            >
              {logged.formatted}
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {' / '}
                {goal.formatted}
              </Text>
            </Text>
          </View>
        </View>
      </View>

      {timeProgress ? (
        <View style={{ gap: 8 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('serviceReportInsights.timeToGoal')}
            </Text>
            <Text
              style={{
                color: theme.colors.text,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {i18n.t('serviceReportInsights.percentComplete', {
                percent: Math.round(timeProgress.percent),
              })}
            </Text>
          </View>
          <SimpleProgressBar
            percentage={timeProgress.fraction}
            color={theme.colors.accent}
            height={10}
            animated={false}
          />
        </View>
      ) : null}

      <View
        style={{
          minHeight: 58,
          padding: 14,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.backgroundLighter,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <LucideIcon
          icon={schedulePresentation.icon}
          color={schedulePresentation.color}
          size={20}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('xs'),
            }}
          >
            {i18n.t('scheduleInsights.schedulePace')}
          </Text>
          <Text
            style={{
              color: schedulePresentation.color,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {schedulePresentation.title}
          </Text>
        </View>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {schedulePresentation.meta}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <InsightStat
          label={i18n.t('planned')}
          value={planned.formatted}
          sub={ofGoal}
        />
        <InsightStat
          label={i18n.t('scheduleInsights.projected')}
          value={projected.formatted}
          sub={ofGoal}
        />
      </View>

      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: 19,
        }}
      >
        {i18n.t('serviceReportInsights.projectionDescription')}
      </Text>
    </>
  )
}

interface Props {
  children: ReactNode
  containerStyle?: StyleProp<ViewStyle>
}

const ServiceReportTimeOverlay = ({ children, containerStyle }: Props) => (
  <ServiceReportInsightOverlay
    containerStyle={containerStyle}
    accessibilityLabel={i18n.t('serviceReportInsights.openTime')}
    accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
    expandedHeight={410}
    content={({ close }) => <TimeInsightContent onClose={close} />}
  >
    {children}
  </ServiceReportInsightOverlay>
)

export default ServiceReportTimeOverlay
