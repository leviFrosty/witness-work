import {
  ArrowUpRight as ArrowUpRightIcon,
  CalendarClock as CalendarClockIcon,
  ChevronRight as ChevronRightIcon,
  CircleCheck as CircleCheckIcon,
  TrendingDown as TrendingDownIcon,
  TrendingUp as TrendingUpIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'

import PopoverCard from '@/components/PopoverCard'
import IconButton from '@/components/ui/IconButton'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import i18n, { type TranslationKey } from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { type ScheduleStatusState } from '@/lib/scheduleStatus'

const STATUS_TITLE_KEYS: Record<ScheduleStatusState, TranslationKey> = {
  ahead: 'scheduleStatus.ahead',
  behind: 'scheduleStatus.behind',
  onTrack: 'scheduleStatus.onTrack',
  noPlan: 'scheduleStatus.noPlan',
  notStarted: 'scheduleStatus.upcoming',
}

type Props =
  | {
      month: number
      year: number
      variant: 'schedule'
    }
  | {
      month: number
      year: number
      variant: 'dashboard'
      onOpenSchedule: () => void
    }

const DetailStat = ({ label, value }: { label: string; value: string }) => {
  const theme = useTheme()

  return (
    <View
      style={{
        flex: 1,
        gap: 4,
        padding: 12,
        borderRadius: theme.numbers.borderRadiusMd,
        backgroundColor: theme.colors.backgroundLighter,
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
          fontSize: theme.fontSize('lg'),
        }}
      >
        {value}
      </Text>
    </View>
  )
}

/** Shared schedule-pace card and detail overlay for Schedule and Home. */
const SchedulePaceInsight = (props: Props) => {
  const { month, year, variant } = props
  const theme = useTheme()
  const status = useScheduleStatus({ month, year })

  const difference = useFormattedMinutes(Math.abs(status.differenceMinutes))
  const actual = useFormattedMinutes(status.actualMinutes)
  const planned = useFormattedMinutes(status.plannedMinutes)

  const statusTitle = i18n.t(STATUS_TITLE_KEYS[status.state])
  const statusMeta = (() => {
    switch (status.state) {
      case 'ahead':
        return `+${difference.formatted}`
      case 'behind':
        return `-${difference.formatted}`
      case 'onTrack':
        return i18n.t('scheduleStatus.matched')
      case 'noPlan':
        return i18n.t('scheduleStatus.noPlannedTime')
      case 'notStarted':
        return i18n.t('scheduleStatus.notStarted')
    }
  })()
  const statusColor = (() => {
    switch (status.state) {
      case 'ahead':
      case 'onTrack':
        return theme.colors.accent
      case 'behind':
        return theme.colors.warn
      default:
        return theme.colors.textAlt
    }
  })()
  const statusIcon: AppIcon = (() => {
    switch (status.state) {
      case 'ahead':
        return TrendingUpIcon
      case 'behind':
        return TrendingDownIcon
      case 'onTrack':
        return CircleCheckIcon
      default:
        return CalendarClockIcon
    }
  })()
  const progress =
    status.plannedMinutes > 0
      ? Math.max(0, status.actualMinutes / status.plannedMinutes)
      : status.actualMinutes > 0
        ? 1
        : 0

  const openSchedule = (close: () => void) => {
    if (variant !== 'dashboard') return
    close()
    setTimeout(props.onOpenSchedule, 150)
  }

  return (
    <PopoverCard
      containerStyle={
        variant === 'dashboard' ? { width: '48.5%' } : { flex: 1 }
      }
      cardStyle={{
        minHeight: variant === 'dashboard' ? 112 : 102,
        padding: 12,
        gap: 10,
        justifyContent: 'space-between',
      }}
      fill={variant === 'schedule'}
      accessibilityLabel={`${statusTitle}. ${statusMeta}`}
      accessibilityHint={i18n.t('scheduleInsights.tapForDetails')}
      popoverContent={({ close }) => (
        <>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 19,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.backgroundLighter,
                }}
              >
                <LucideIcon icon={statusIcon} color={statusColor} size={20} />
              </View>
              <Text
                accessibilityRole='header'
                style={{
                  color: theme.colors.text,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('xl'),
                }}
              >
                {i18n.t('scheduleInsights.schedulePace')}
              </Text>
            </View>
            {variant === 'dashboard' ? (
              <IconButton
                icon={ArrowUpRightIcon}
                size='lg'
                noTransform
                onPress={() => openSchedule(close)}
                accessibilityLabel={i18n.t('homeDashboard.openDestination', {
                  destination: i18n.t('schedule'),
                })}
              />
            ) : (
              <IconButton
                icon={XIcon}
                size='lg'
                onPress={close}
                accessibilityLabel={i18n.t('close')}
              />
            )}
          </View>

          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'baseline',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <Text
                style={{
                  color: statusColor,
                  fontFamily: theme.fonts.bold,
                  fontSize: theme.fontSize('2xl'),
                }}
              >
                {statusTitle}
              </Text>
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {statusMeta}
              </Text>
            </View>
            <SimpleProgressBar
              percentage={progress}
              color={statusColor}
              height={variant === 'dashboard' ? 8 : 10}
              animated={false}
            />
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <DetailStat label={i18n.t('actual')} value={actual.formatted} />
            <DetailStat label={i18n.t('planned')} value={planned.formatted} />
          </View>

          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              lineHeight: 19,
            }}
          >
            {i18n.t(
              moment({ year, month }).isSame(moment(), 'month')
                ? 'scheduleInsights.paceDescriptionCurrent'
                : 'scheduleInsights.paceDescriptionMonth'
            )}
          </Text>
        </>
      )}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <View
          style={{
            width: 30,
            height: 30,
            borderRadius: 15,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <LucideIcon icon={statusIcon} color={statusColor} size={16} />
        </View>
        {variant === 'schedule' ? (
          <LucideIcon
            icon={ChevronRightIcon}
            color={theme.colors.textAlt}
            size={12}
          />
        ) : null}
      </View>
      <View style={{ gap: 1 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: statusColor,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {statusTitle}
        </Text>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: theme.colors.textAlt,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {statusMeta}
        </Text>
      </View>
    </PopoverCard>
  )
}

export default SchedulePaceInsight
