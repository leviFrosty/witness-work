import { Bell as BellIcon } from 'lucide-react-native'
import moment from 'moment'
import { useWindowDimensions, View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getReadableTextColor } from '@/lib/color'
import { formatDate, formatMonthDayCompact, formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import VisitOutcomeMarker from '@/features/contacts/components/VisitOutcomeMarker'
import {
  Journey,
  UpNext,
  VisitOutcome,
} from '@/features/contacts/lib/visitTimeline'
import { tracking } from '@/lib/tracking'

const RAIL_HEIGHT = 30
const LINE_TOP = 13
const PILL_SLOT = 120

const pct = (value: number) => `${value * 100}%` as const

const dotSize = (outcome: VisitOutcome) => (outcome === 'study' ? 11 : 9)

const KEY_OUTCOMES: VisitOutcome[] = ['study', 'conversation', 'notAtHome']
const COUNT_KEY = {
  study: 'studyCount',
  conversation: 'conversationCount',
  notAtHome: 'notAtHomeCount',
} as const

const VisitJourneyCard = ({
  journey,
  upNext,
}: {
  journey: Journey
  upNext: UpNext | null
}) => {
  const theme = useTheme()
  const textScale = Math.max(1, useWindowDimensions().fontScale)
  const today = journey.todayPosition
  const labelStyle = {
    fontSize: theme.fontSize('xs') + 0.5,
    fontFamily: theme.fonts.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: tracking(0.3),
    color: theme.colors.textAlt,
  }
  const captionStyle = {
    fontSize: theme.fontSize('sm'),
    color: theme.colors.textAlt,
  }

  return (
    <View
      style={{
        backgroundColor: theme.colors.card,
        borderRadius: theme.numbers.borderRadiusLg,
        paddingTop: 14,
        paddingBottom: 12,
        paddingHorizontal: 18,
        gap: 8,
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      {}
      <View style={{ height: 18 * textScale }}>
        <View
          style={
            today === 1
              ? { position: 'absolute', right: 0 }
              : {
                  position: 'absolute',
                  left: pct(today),

                  width: PILL_SLOT * textScale,
                  marginLeft: (-PILL_SLOT * textScale) / 2,
                  alignItems: 'center',
                }
          }
        >
          <View
            style={{
              paddingHorizontal: 7,
              paddingVertical: 2,
              borderRadius: 9,
              backgroundColor: theme.colors.text,
            }}
          >
            <Text
              numberOfLines={1}
              style={{
                ...labelStyle,
                color: getReadableTextColor(theme.colors.text),
              }}
            >
              {i18n.t('today')}
            </Text>
          </View>
        </View>
      </View>
      <View style={{ height: RAIL_HEIGHT, marginTop: -10 }}>
        <View
          style={{
            position: 'absolute',
            top: LINE_TOP,
            left: 0,
            width: pct(today),
            height: 3,
            borderRadius: 2,
            backgroundColor: theme.colors.border,
          }}
        />
        {upNext && (
          <View
            style={{
              position: 'absolute',
              top: LINE_TOP + 0.5,
              left: pct(today),
              right: 18,
              height: 0,
              borderWidth: 1.25,
              borderStyle: 'dashed',
              borderColor: theme.colors.accent,
            }}
          />
        )}
        {journey.dots.map((dot) => {
          const size = dotSize(dot.outcome)
          return (
            <View
              key={dot.id}
              style={{
                position: 'absolute',
                top: LINE_TOP + 1.5 - size / 2,
                left: pct(dot.position),

                marginLeft: -size * dot.position,
              }}
            >
              <VisitOutcomeMarker outcome={dot.outcome} size={size} />
            </View>
          )
        })}
        {}
        <View
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: pct(today),
            marginLeft: -1.5 - 3 * today,
            width: 3,
            borderRadius: 1.5,
            backgroundColor: theme.colors.text,
          }}
        />
        {upNext && (
          <View
            style={{
              position: 'absolute',
              top: LINE_TOP + 1.5 - 10,
              right: 0,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: theme.colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <LucideIcon icon={BellIcon} size={10} color={theme.colors.card} />
          </View>
        )}
      </View>
      {}
      <View
        style={{
          direction: 'ltr',
          minHeight: 20,
          paddingTop: 2,
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: 12,
        }}
      >
        <Text style={labelStyle}>{formatRelative(journey.windowStart)}</Text>
        {upNext && (
          <Text
            style={[
              labelStyle,
              { marginLeft: 'auto', color: theme.colors.accent },
            ]}
          >
            {formatMonthDayCompact(moment(upNext.date))}
          </Text>
        )}
      </View>
      {}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          columnGap: 12,
          rowGap: 4,
        }}
      >
        {KEY_OUTCOMES.filter((outcome) => journey.outcomeCounts[outcome]).map(
          (outcome) => (
            <View
              key={outcome}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
            >
              <VisitOutcomeMarker outcome={outcome} size={dotSize(outcome)} />
              <Text style={captionStyle}>
                {}
                {i18n.t(`contactDetails.${COUNT_KEY[outcome]}`, {
                  count: journey.outcomeCounts[outcome],
                })}
              </Text>
            </View>
          )
        )}
        <Text style={captionStyle}>
          {i18n.t('contactDetails.journeySince', {
            date: formatDate(journey.first, { style: 'medium' }),
          })}
        </Text>
      </View>
    </View>
  )
}

export default VisitJourneyCard
