import { View, ViewProps } from 'react-native'
import { usePreferences } from '../stores/preferences'
import { useServiceReport } from '../stores/serviceReport'
import useTheme from '../contexts/theme'
import {
  calculateProgress,
  getTotalHoursDetailedForSpecificMonth,
  totalHoursForSpecificMonth,
} from '../lib/serviceReport'
import { useCallback, useMemo } from 'react'
import Text from './MyText'
import i18n from '../lib/locales'
import Circle from './Circle'

interface ProgressBarSegmentBaseProps extends ViewProps {
  borderRadiusLeft?: boolean
  borderRadiusRight?: boolean
}

const ProgressBarSegment = ({
  style,
  borderRadiusLeft,
  borderRadiusRight,
  ...props
}: ProgressBarSegmentBaseProps) => {
  const theme = useTheme()

  return (
    <View
      style={[
        [
          {
            borderTopLeftRadius: borderRadiusLeft
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomLeftRadius: borderRadiusLeft
              ? theme.numbers.borderRadiusSm
              : 0,
            borderTopRightRadius: borderRadiusRight
              ? theme.numbers.borderRadiusSm
              : 0,
            borderBottomRightRadius: borderRadiusRight
              ? theme.numbers.borderRadiusSm
              : 0,
            height: 20,
          },
        ],
        [style],
      ]}
      {...props}
    />
  )
}

type ProgressBarSegmentProps = {
  percentage: number
  color?: string
}

const StandardHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
      borderRadiusLeft
    />
  )
}

const LdcHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
    />
  )
}
const OtherHours = ({ percentage, color }: ProgressBarSegmentProps) => {
  return (
    <ProgressBarSegment
      style={{
        backgroundColor: color,
        width: `${percentage * 100}%`,
      }}
    />
  )
}

interface ProgressBarKeyProps {
  color: string
  label: string
}
const ProgressBarKey = ({ color, label }: ProgressBarKeyProps) => {
  const theme = useTheme()
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
      <Circle color={color} />
      <Text style={{ fontSize: theme.fontSize('sm') }}>{label}</Text>
    </View>
  )
}

interface ProgressBarProps {
  month: number
  year: number
  minimal?: boolean
}

const ProgressBar = ({ month, year, minimal }: ProgressBarProps) => {
  const theme = useTheme()
  const { serviceReports } = useServiceReport()
  const { publisher, publisherHours } = usePreferences()
  const goalHours = publisherHours[publisher]

  const totalHours = useMemo(
    () => totalHoursForSpecificMonth(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const progress = useMemo(
    () => calculateProgress({ hours: totalHours, goalHours }),
    [totalHours, goalHours]
  )

  const hoursDetailed = useMemo(
    () => getTotalHoursDetailedForSpecificMonth(serviceReports, month, year),
    [month, serviceReports, year]
  )

  const hasStandardHours = useMemo(
    () => hoursDetailed.standard > 0,
    [hoursDetailed.standard]
  )
  const hasLdcHours = useMemo(() => hoursDetailed.ldc > 0, [hoursDetailed.ldc])

  const otherColors = useMemo(
    () =>
      minimal
        ? [theme.colors.accent]
        : [
            theme.colors.accent2,
            theme.colors.accent2Alt,
            theme.colors.warn,
            theme.colors.warnAlt,
            theme.colors.accent3,
            theme.colors.accent3Alt,
          ],
    [
      minimal,
      theme.colors.accent,
      theme.colors.accent2,
      theme.colors.accent2Alt,
      theme.colors.accent3,
      theme.colors.accent3Alt,
      theme.colors.warn,
      theme.colors.warnAlt,
    ]
  )

  const renderOtherHours = useCallback(() => {
    let currentIndex = 0
    return hoursDetailed.other.map((report, index) => {
      if (currentIndex > otherColors.length - 1) {
        currentIndex = 0
      }

      const color = otherColors[currentIndex]
      currentIndex += 1

      return (
        <OtherHours
          key={`${report.tag}-${index}`}
          color={color}
          percentage={report.hours / totalHours}
        />
      )
    })
  }, [hoursDetailed.other, otherColors, totalHours])

  const renderOtherHoursColorKeys = useCallback(() => {
    let currentIndex = 0
    return hoursDetailed.other.map((report, index) => {
      if (currentIndex > otherColors.length - 1) {
        currentIndex = 0
      }

      const color = otherColors[currentIndex]
      currentIndex += 1

      return (
        <ProgressBarKey
          key={`${report.tag}-${index}`}
          color={color}
          label={report.tag}
        />
      )
    })
  }, [hoursDetailed.other, otherColors])

  return (
    <View
      style={{
        gap: 3,
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusSm,
        padding: 10,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 2,
          position: 'relative',
          width: '100%',
          backgroundColor: theme.colors.background,
          borderRadius: theme.numbers.borderRadiusSm,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            flexDirection: 'row',
            alignItems: 'center',
          }}
        >
          {hasStandardHours && (
            <StandardHours
              percentage={hoursDetailed.standard / totalHours}
              color={theme.colors.accent}
            />
          )}
          {hasLdcHours && (
            <LdcHours
              percentage={hoursDetailed.ldc / totalHours}
              color={minimal ? theme.colors.accent : theme.colors.accentAlt}
            />
          )}
          {renderOtherHours()}
        </View>
      </View>
      {!minimal && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 7,
            flexWrap: 'wrap',
          }}
        >
          {hasStandardHours && (
            <ProgressBarKey
              color={theme.colors.accent}
              label={i18n.t('standard')}
            />
          )}
          {hasLdcHours && (
            <ProgressBarKey
              color={theme.colors.accentAlt}
              label={i18n.t('ldc')}
            />
          )}
          {renderOtherHoursColorKeys()}
        </View>
      )}
    </View>
  )
}

export default ProgressBar
