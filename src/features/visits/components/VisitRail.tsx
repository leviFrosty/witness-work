import type { ReactNode } from 'react'
import { View } from 'react-native'
import {
  BellOff as BellOffIcon,
  BookOpen as BookOpenIcon,
  Check as CheckIcon,
  Clock as ClockIcon,
  DoorClosed as DoorClosedIcon,
  MessageCircle as MessageCircleIcon,
  Plus as PlusIcon,
  TriangleAlert as TriangleAlertIcon,
} from 'lucide-react-native'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { withAlpha } from '@/lib/color'
import i18n from '@/lib/locales'
import { tracking } from '@/lib/tracking'

export type RailNode =
  | 'study'
  | 'conversation'
  | 'notAtHome'
  | 'ahead'
  | 'overdue'
  | 'kept'
  | 'dismissed'
  | 'empty'
  | 'today'

export type RailStop = {
  key: string
  node: RailNode

  ahead?: boolean

  content?: ReactNode
}

const RAIL = 24
const NODE = 22

const TODAY_TICK_OFFSET = 10

function Node({ node }: { node: Exclude<RailNode, 'today'> }) {
  const theme = useTheme()
  const filled = (color: string, icon: AppIcon, iconColor: string) => ({
    style: { backgroundColor: color },
    icon,
    iconColor,
  })
  const outlined = (color: string, icon: AppIcon) => ({
    style: {
      backgroundColor: theme.colors.background,
      borderWidth: 1.5,
      borderStyle: 'dashed' as const,
      borderColor: color,
    },
    icon,
    iconColor: color,
  })
  const onFill = theme.colors.background
  const look = {
    study: filled(theme.colors.accent, BookOpenIcon, onFill),
    conversation: filled(theme.colors.accent, MessageCircleIcon, onFill),
    notAtHome: filled(
      theme.colors.border,
      DoorClosedIcon,
      theme.colors.textAlt
    ),
    ahead: outlined(theme.colors.accent3, ClockIcon),
    overdue: filled(theme.colors.warn, TriangleAlertIcon, onFill),

    kept: filled(theme.colors.accent3, CheckIcon, onFill),
    dismissed: outlined(theme.colors.textAlt, BellOffIcon),
    empty: outlined(theme.colors.textAlt, PlusIcon),
  }[node]
  return (
    <View
      style={[
        {
          width: NODE,
          height: NODE,
          borderRadius: NODE / 2,
          alignItems: 'center',
          justifyContent: 'center',
        },
        look.style,
      ]}
    >
      <LucideIcon icon={look.icon} size={11} color={look.iconColor} />
    </View>
  )
}

function Line({ from, height }: { from: RailStop; height?: number }) {
  const theme = useTheme()
  const size = height ? { height } : { flex: 1, minHeight: 14 }
  if (from.ahead)
    return (
      <View
        style={{
          ...size,
          width: 0,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor:
            from.node === 'ahead' || from.node === 'kept'
              ? theme.colors.accent3
              : theme.colors.textAlt,
        }}
      />
    )
  return (
    <View
      style={{
        ...size,
        width: 2,
        backgroundColor:
          from.node === 'overdue'
            ? withAlpha(theme.colors.warn, 0x80)
            : theme.colors.border,
      }}
    />
  )
}

function TodayMarker() {
  const theme = useTheme()
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: theme.colors.text,
        borderRadius: 6,
        paddingHorizontal: 7,
        paddingVertical: 3,
        marginTop: 2,
      }}
    >
      <Text
        style={{
          color: theme.colors.background,
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.bold,
          letterSpacing: tracking(0.8),
          textTransform: 'uppercase',
        }}
      >
        {i18n.t('today')}
      </Text>
    </View>
  )
}

export default function VisitRail({ stops }: { stops: RailStop[] }) {
  const theme = useTheme()
  return (
    <View>
      {stops.map((stop, index) => {
        const prev = stops[index - 1]
        const next = stops[index + 1]
        return (
          <View key={stop.key} style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ width: RAIL, alignItems: 'center' }}>
              {stop.node === 'today' ? (
                <>
                  {}
                  {prev ? (
                    <Line from={prev} height={TODAY_TICK_OFFSET} />
                  ) : (
                    <View style={{ height: TODAY_TICK_OFFSET }} />
                  )}
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: theme.colors.text,
                    }}
                  />
                </>
              ) : (
                <Node node={stop.node} />
              )}
              {next ? <Line from={stop} /> : null}
            </View>
            <View
              style={{
                flex: 1,
                minWidth: 0,
                paddingBottom: next ? 18 : 0,
              }}
            >
              {stop.node === 'today' ? <TodayMarker /> : stop.content}
            </View>
          </View>
        )
      })}
    </View>
  )
}
