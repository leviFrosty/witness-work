import {
  ChevronRight as ChevronRightIcon,
  X as XIcon,
} from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'

import PopoverCard from '@/components/PopoverCard'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import SimpleProgressBar from '@/components/ui/SimpleProgressBar'
import useTheme from '@/contexts/theme'
import useScheduleStatus from '@/hooks/useScheduleStatus'
import useScheduleStatusPresentation from '@/hooks/useScheduleStatusPresentation'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'

type Props = {
  month: number
  year: number
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

/** Schedule-pace card and detail overlay for the Schedule screen. */
const SchedulePaceInsight = ({ month, year }: Props) => {
  const theme = useTheme()
  const status = useScheduleStatus({ month, year })

  const {
    title: statusTitle,
    meta: statusMeta,
    color: statusColor,
    icon: statusIcon,
    progress,
  } = useScheduleStatusPresentation(status)
  const actual = useFormattedMinutes(status.actualMinutes)
  const planned = useFormattedMinutes(status.plannedMinutes)

  return (
    <PopoverCard
      containerStyle={{ flex: 1 }}
      cardStyle={{
        minHeight: 84,
        padding: 12,
        gap: 10,
        justifyContent: 'space-between',
      }}
      fill
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
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <LucideIcon icon={statusIcon} color={statusColor} size={16} />
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
            <IconButton
              icon={XIcon}
              size='lg'
              onPress={close}
              accessibilityLabel={i18n.t('close')}
            />
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
              height={10}
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
      <View style={{ flex: 1, justifyContent: 'center', gap: 6 }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          style={{
            color: statusColor,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('2xl'),
          }}
        >
          {statusTitle}
        </Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flexShrink: 1,
            }}
          >
            <LucideIcon icon={statusIcon} color={statusColor} size={14} />
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                flexShrink: 1,
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {statusMeta}
            </Text>
          </View>
          <LucideIcon
            icon={ChevronRightIcon}
            color={theme.colors.textAlt}
            size={12}
          />
        </View>
      </View>
    </PopoverCard>
  )
}

export default SchedulePaceInsight
