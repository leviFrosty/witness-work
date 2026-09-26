import {
  Bell as BellIcon,
  BellOff as BellOffIcon,
  CalendarClock as CalendarClockIcon,
  Navigation as NavigationIcon,
  Plus as PlusIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getReadableTextColor, withAlpha } from '@/lib/color'
import { formatRelative, formatTime } from '@/lib/dates'
import i18n from '@/lib/locales'
import { relativeDayLabel } from '@/features/contacts/lib/visitDates'
import { UpNext } from '@/features/contacts/lib/visitTimeline'

type Props = {
  upNext: UpNext
  /** Pull the card up over the hero. */
  overlap: boolean
  onLogVisit: () => void
  onReschedule: () => void
  /** Omitted when the contact has no address or coordinate. */
  onNavigate?: () => void
}

/** The soonest upcoming follow-up, promoted above everything else. */
const UpNextCard = ({
  upNext,
  overlap,
  onLogVisit,
  onReschedule,
  onNavigate,
}: Props) => {
  const theme = useTheme()
  const background = theme.colors.accent3
  const foreground = getReadableTextColor(background)
  const muted = withAlpha(foreground, 0xcc)
  const buttonStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 12,
    borderRadius: theme.numbers.borderRadiusMd,
    borderWidth: 1,
    borderColor: withAlpha(foreground, 0x47),
    backgroundColor: withAlpha(foreground, 0x24),
  }

  return (
    <Button
      onPress={onLogVisit}
      accessibilityRole='button'
      style={{
        marginTop: overlap ? -46 : 0,
        backgroundColor: background,
        borderRadius: theme.numbers.borderRadiusLg,
        paddingVertical: 16,
        paddingHorizontal: 18,
        gap: 9,
        shadowColor: '#000',
        shadowOpacity: 0.25,
        shadowRadius: 11,
        shadowOffset: { width: 0, height: 8 },
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flexShrink: 1,
            fontSize: theme.fontSize('xs') + 1,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
            letterSpacing: 0.5,
            color: muted,
          }}
        >
          {i18n.t('contactDetails.upNext', {
            countdown: formatRelative(upNext.date),
          })}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <LucideIcon
            icon={upNext.notifyMe ? BellIcon : BellOffIcon}
            size={12}
            color={muted}
          />
          <Text
            style={{
              fontSize: theme.fontSize('xs') + 1,
              fontFamily: theme.fonts.semiBold,
              color: muted,
            }}
          >
            {upNext.notifyMe
              ? i18n.t('contactDetails.reminderOn')
              : i18n.t('contactDetails.reminderOff')}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontSize: theme.fontSize('xl'),
          fontFamily: theme.fonts.bold,
          color: foreground,
        }}
      >
        {i18n.t('contactDetails.upNextWhen', {
          day: relativeDayLabel(upNext.date),
          time: formatTime(upNext.date),
        })}
      </Text>
      {upNext.topic && (
        <Text
          numberOfLines={2}
          style={{
            fontSize: theme.fontSize('sm') + 1,
            lineHeight: 19,
            color: withAlpha(foreground, 0xe0),
          }}
        >
          {upNext.topic}
        </Text>
      )}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Button
          onPress={onLogVisit}
          style={{
            ...buttonStyle,
            flex: 1,
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accent,
          }}
        >
          <LucideIcon
            icon={PlusIcon}
            size={14}
            color={getReadableTextColor(theme.colors.accent)}
          />
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              color: getReadableTextColor(theme.colors.accent),
            }}
          >
            {i18n.t('logVisit')}
          </Text>
        </Button>
        {onNavigate && (
          <Button onPress={onNavigate} style={buttonStyle}>
            <LucideIcon icon={NavigationIcon} size={13} color={foreground} />
            <Text
              style={{ fontFamily: theme.fonts.semiBold, color: foreground }}
            >
              {i18n.t('navigate')}
            </Text>
          </Button>
        )}
        <Button
          onPress={onReschedule}
          accessibilityLabel={i18n.t('reschedule')}
          style={buttonStyle}
        >
          <LucideIcon icon={CalendarClockIcon} size={15} color={foreground} />
        </Button>
      </View>
    </Button>
  )
}

export default UpNextCard
