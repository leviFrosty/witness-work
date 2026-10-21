import {
  CalendarClock as CalendarClockIcon,
  Clock as ClockIcon,
  History as HistoryIcon,
  MapPin as MapPinIcon,
  Search as SearchIcon,
  Users as UsersIcon,
} from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import Text from '@/components/ui/MyText'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import type { SuggestedSectionKey } from '@/lib/suggestedContacts'
import { tracking } from '@/lib/tracking'

/**
 * Everyone else ('all' or 'other') and search results sit below the
 * suggestions.
 */
export type SuggestedHeaderSection =
  | SuggestedSectionKey
  | 'all'
  | 'other'
  | 'search'

const ICONS: Record<SuggestedHeaderSection, AppIcon> = {
  nearby: MapPinIcon,
  followUpsDue: ClockIcon,
  recent: HistoryIcon,
  beenAWhile: CalendarClockIcon,
  all: UsersIcon,
  other: UsersIcon,
  search: SearchIcon,
}

/**
 * Small uppercase label with an icon above each part of a suggested Contacts
 * list, shared by the Contacts list and the Log Visit picker.
 */
export default function SuggestedSectionHeader({
  title,
  section,
  testID,
}: {
  title: string
  section: SuggestedHeaderSection
  testID?: string
}) {
  const theme = useTheme()
  // At accessibility sizes the title wraps instead of cutting off.
  const largeText = useAccessibilityTextSize()
  return (
    <View
      accessible
      accessibilityRole='header'
      accessibilityLabel={title}
      testID={testID}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 4,
      }}
    >
      <LucideIcon
        icon={ICONS[section]}
        size={theme.fontSize('xs')}
        style={{ color: theme.colors.textAlt }}
      />
      <Text
        numberOfLines={largeText ? undefined : 1}
        style={{
          flexShrink: 1,
          color: theme.colors.textAlt,
          textTransform: 'uppercase',
          fontSize: theme.fontSize('xs'),
          fontFamily: theme.fonts.semiBold,
          letterSpacing: tracking(0.5),
        }}
      >
        {title}
      </Text>
    </View>
  )
}
