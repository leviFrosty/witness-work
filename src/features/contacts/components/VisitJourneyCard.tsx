import { Bell as BellIcon } from 'lucide-react-native'
import moment from 'moment'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getReadableTextColor } from '@/lib/color'
import { formatDate, formatMonthDayCompact, formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'
import { Journey, UpNext } from '@/features/contacts/lib/visitTimeline'

const RAIL_HEIGHT = 30
const LINE_TOP = 13
const PILL_SLOT = 120

const pct = (value: number) => `${value * 100}%` as const

/**
 * The last six months at a glance: a dot per visit, a "Today" marker, and a
 * dashed run to the next follow-up. Whole-history totals sit in a quiet caption
 * underneath.
 */
const VisitJourneyCard = ({
  journey,
  upNext,
}: {
  journey: Journey
  upNext: UpNext | null
}) => {
  const theme = useTheme()
  const plural = (key: 'visitCount' | 'studyCount', count: number) =>
    // @ts-expect-error TranslationKey doesn't handle keys that contain objects.
    i18n.t(`contactDetails.${key}`, { count }) as string
  const today = journey.todayPosition
  const labelStyle = {
    fontSize: theme.fontSize('xs') + 0.5,
    fontFamily: theme.fonts.semiBold,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.3,
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
      {/* Today: a dark pill and a full-height tick in the text color, like
          the calendar's today ring. */}
      <View style={{ height: 18 }}>
        <View
          style={
            today === 1
              ? { position: 'absolute', right: 0 }
              : {
                  position: 'absolute',
                  left: pct(today),
                  // Wide enough for the label, centered on the tick.
                  width: PILL_SLOT,
                  marginLeft: -PILL_SLOT / 2,
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
          const size = dot.outcome === 'study' ? 11 : 9
          return (
            <View
              key={dot.id}
              style={{
                position: 'absolute',
                top: LINE_TOP + 1.5 - size / 2,
                left: pct(dot.position),
                // Shift by the dot's own width in proportion so both ends
                // stay inside the rail.
                marginLeft: -size * dot.position,
                width: size,
                height: size,
                borderRadius: dot.outcome === 'notAtHome' ? 2 : size / 2,
                backgroundColor:
                  dot.outcome === 'study'
                    ? theme.colors.accent
                    : theme.colors.card,
                borderWidth: dot.outcome === 'study' ? 0 : 2,
                borderColor: theme.colors.textAlt,
              }}
            />
          )
        })}
        <View
          accessible
          accessibilityLabel={i18n.t('today')}
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
      <View style={{ height: 20 }}>
        <Text style={[labelStyle, { position: 'absolute', left: 0, top: 2 }]}>
          {formatRelative(journey.windowStart)}
        </Text>
        {upNext && (
          <Text
            style={[
              labelStyle,
              {
                position: 'absolute',
                right: 0,
                top: 2,
                color: theme.colors.accent,
              },
            ]}
          >
            {formatMonthDayCompact(moment(upNext.date))}
          </Text>
        )}
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('contactDetails.journeySummary', {
          visits: plural('visitCount', journey.visitCount),
          studies: plural('studyCount', journey.studyCount),
          date: formatDate(journey.first, { style: 'medium' }),
        })}
      </Text>
    </View>
  )
}

export default VisitJourneyCard
