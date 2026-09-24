import { Pressable, View } from 'react-native'
import { MapPin as MapPinIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import { openURL } from '@/lib/links'
import { appleMapsUrl, formatPlanLocation } from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'

/** A Plan's place; tapping opens it in Apple Maps. */
export default function PlanLocationLink({
  location,
  compact,
}: {
  location: PlanLocation
  /** One line: the place name (or address) only. */
  compact?: boolean
}) {
  const theme = useTheme()
  const { primary, secondary } = formatPlanLocation(location)
  const url = appleMapsUrl(location)
  if (!primary) return null

  return (
    <Pressable
      accessibilityRole='link'
      accessibilityLabel={secondary ? `${primary}, ${secondary}` : primary}
      disabled={!url}
      hitSlop={6}
      onPress={() => url && openURL(url)}
    >
      <XView style={{ gap: 6, alignItems: 'flex-start' }}>
        <LucideIcon
          icon={MapPinIcon}
          size={14}
          color={theme.colors.accent}
          style={{ marginTop: 2 }}
        />
        <View style={{ flexShrink: 1 }}>
          <Text
            style={{
              color: theme.colors.accent,
              fontSize: compact ? theme.fontSize('sm') : undefined,
            }}
            numberOfLines={compact ? 1 : undefined}
          >
            {primary}
          </Text>
          {secondary && !compact ? (
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
              }}
            >
              {secondary}
            </Text>
          ) : null}
        </View>
      </XView>
    </Pressable>
  )
}
