import type { ReactNode } from 'react'
import { View } from 'react-native'
import Animated, {
  DerivedValue,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated'
import {
  Check as CheckIcon,
  FileText as FileTextIcon,
  Send as SendIcon,
} from 'lucide-react-native'
import moment from 'moment'
import useTheme from '@/contexts/theme'
import LucideIcon from '@/components/ui/LucideIcon'
import i18n from '@/lib/locales'
import { useFormattedMinutes } from '@/lib/minutes'
import { WelcomePalette } from '@/features/onboarding/lib/welcomePalette'
import {
  IconTile,
  RevealVisualProps,
  Surface,
  TapRipple,
  VisualText,
  backOut,
  seg,
  useRiseStyle,
  useVisualClock,
} from '@/features/updates/components/reveal/visuals/kit'

const CARD = { top: 6, side: 18, height: 236 }
/** Share is tapped, the report flies off, comes back confirmed, then resets. */
const T = { tap: 0.34, fly: [0.4, 0.56], confirm: [0.58, 0.7], reset: 0.9 }

/**
 * Reporting: the month's report is already filled in from what was logged; a
 * tap shares it and it comes back confirmed.
 */
const ReportVisual = ({ palette, active, reduceMotion }: RevealVisualProps) => {
  const theme = useTheme()
  const color = theme.colors.orange
  const accent = theme.colors.accent
  const hours = useFormattedMinutes(52 * 60).formatted
  const { intro, loop } = useVisualClock({
    active,
    reduceMotion,
    introMs: 1100,
    loopMs: 5200,
    restAt: 0.2,
  })

  const cardIn = useRiseStyle(intro, 0, 0.45, 22)
  const reset = useDerivedValue(() => seg(loop.value, T.reset, 0.98))
  const tap = useDerivedValue(() => seg(loop.value, T.tap, T.tap + 0.08))
  const fly = useDerivedValue(
    () => seg(loop.value, T.fly[0], T.fly[1]) * (1 - reset.value)
  )
  const confirm = useDerivedValue(
    () => seg(loop.value, T.confirm[0], T.confirm[1]) * (1 - reset.value)
  )

  // Off to the top right like a paper plane, and back when the loop restarts.
  const flightStyle = useAnimatedStyle(() => ({
    opacity: 1 - fly.value,
    transform: [
      { translateX: fly.value * 120 },
      { translateY: -fly.value * 90 },
      { rotate: `${-fly.value * 14}deg` },
      { scale: 1 - fly.value * 0.4 },
    ],
  }))
  const buttonStyle = useAnimatedStyle(() => {
    const dip = seg(tap.value, 0, 0.3) * (1 - seg(tap.value, 0.3, 1))
    return { transform: [{ scale: 1 - dip * 0.05 }] }
  })
  const confirmStyle = useAnimatedStyle(() => ({
    opacity: confirm.value,
    transform: [{ scale: 0.6 + 0.4 * backOut(confirm.value) }],
  }))

  const rows = [
    {
      id: 'shared',
      label: i18n.t('sharedInMinistry'),
      value: <CheckDot color={accent} />,
    },
    { id: 'studies', label: i18n.t('studies'), value: '3' },
    { id: 'hours', label: i18n.t('hours'), value: hours },
  ]

  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: CARD.side,
            right: CARD.side,
            top: CARD.top,
            height: CARD.height,
          },
          cardIn,
        ]}
      >
        <Animated.View style={[{ flex: 1 }, flightStyle]}>
          <Surface palette={palette} style={{ flex: 1, padding: 16 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <IconTile icon={FileTextIcon} color={color} size={34} />
              <View style={{ flex: 1 }}>
                <VisualText
                  style={{
                    fontSize: 15,
                    fontFamily: theme.fonts.bold,
                    color: palette.text,
                  }}
                >
                  {i18n.t('fieldServiceReport')}
                </VisualText>
                <VisualText style={{ fontSize: 11, color: palette.textAlt }}>
                  {moment().subtract(1, 'month').format('MMMM YYYY')}
                </VisualText>
              </View>
            </View>
            <View style={{ marginTop: 12 }}>
              {rows.map((row, i) => (
                <Row
                  key={row.id}
                  label={row.label}
                  value={row.value}
                  first={i === 0}
                  intro={intro}
                  from={0.3 + i * 0.15}
                  palette={palette}
                />
              ))}
            </View>
            <Animated.View
              style={[
                {
                  marginTop: 'auto',
                  height: 40,
                  borderRadius: 12,
                  borderCurve: 'continuous',
                  backgroundColor: accent,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                },
                buttonStyle,
              ]}
            >
              <LucideIcon icon={SendIcon} size={16} color='#FFFFFF' />
              <VisualText
                style={{
                  fontSize: 14,
                  fontFamily: theme.fonts.bold,
                  color: '#FFFFFF',
                }}
              >
                {i18n.t('share')}
              </VisualText>
              <TapRipple tap={tap} color={accent} size={48} />
            </Animated.View>
          </Surface>
        </Animated.View>
      </Animated.View>

      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: CARD.top,
          height: CARD.height,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View
          style={[
            {
              alignItems: 'center',
              gap: 12,
            },
            confirmStyle,
          ]}
        >
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              backgroundColor: accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: accent,
              shadowOpacity: 0.45,
              shadowRadius: 18,
              shadowOffset: { width: 0, height: 6 },
            }}
          >
            <LucideIcon
              icon={CheckIcon}
              size={38}
              color='#FFFFFF'
              strokeWidth={3}
            />
          </View>
          <VisualText
            style={{
              fontSize: 18,
              fontFamily: theme.fonts.bold,
              color: palette.text,
            }}
          >
            {i18n.t('reportSubmitted')}
          </VisualText>
        </Animated.View>
      </View>
    </View>
  )
}

/** A line of the report, rising in as the card builds. */
const Row = ({
  label,
  value,
  first,
  intro,
  from,
  palette,
}: {
  label: string
  value: ReactNode
  first: boolean
  intro: DerivedValue<number>
  from: number
  palette: WelcomePalette
}) => {
  const theme = useTheme()
  const style = useRiseStyle(intro, from, from + 0.35, 10)
  return (
    <Animated.View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 9,
          borderTopWidth: first ? 0 : 1,
          borderTopColor: palette.ringTrack,
        },
        style,
      ]}
    >
      <VisualText style={{ fontSize: 13, color: palette.textAlt }}>
        {label}
      </VisualText>
      {typeof value === 'string' ? (
        <VisualText
          style={{
            fontSize: 15,
            fontFamily: theme.fonts.bold,
            color: palette.text,
          }}
        >
          {value}
        </VisualText>
      ) : (
        value
      )}
    </Animated.View>
  )
}

const CheckDot = ({ color }: { color: string }) => (
  <View
    style={{
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: color,
      alignItems: 'center',
      justifyContent: 'center',
    }}
  >
    <LucideIcon icon={CheckIcon} size={12} color='#FFFFFF' strokeWidth={3} />
  </View>
)

export default ReportVisual
