import { View } from 'react-native'
import { MapPin as MapPinIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import ContextMenu from '@/components/ui/ContextMenu'
import { useLinkActions } from '@/components/RichLinkCard'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { appleMapsUrl, formatPlanLocation } from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'

/** A location as copyable text: the place name and address, one per line. */
export const planLocationText = (location: PlanLocation): string => {
  const { primary, secondary } = formatPlanLocation(location)
  return [primary, secondary].filter(Boolean).join('\n')
}

/**
 * A Plan's place; tapping opens it in Apple Maps, long-pressing offers Open in
 * Maps / Copy Address / Share….
 */
export default function PlanLocationLink({
  location,
  compact,
  interactive = true,
}: {
  location: PlanLocation
  /** One line: the place name (or address) only. */
  compact?: boolean
  /**
   * Off when the link sits inside another long-press target (e.g. a Plan row):
   * it renders as plain content and the host offers the actions in its menu.
   */
  interactive?: boolean
}) {
  const theme = useTheme()
  const { copyText, share } = useLinkActions()
  const { primary, secondary } = formatPlanLocation(location)
  const url = appleMapsUrl(location)
  if (!primary) return null

  const content = (
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
  )

  if (!interactive) return content

  return (
    <ContextMenu
      accessibilityLabel={secondary ? `${primary}, ${secondary}` : primary}
      onPress={url ? () => void openURL(url) : undefined}
      actions={[
        url
          ? {
              id: 'open_in_maps',
              title: i18n.t('openInMaps'),
              systemImage: 'map',
              onPress: () => void openURL(url),
            }
          : null,
        {
          id: 'copy_address',
          title: i18n.t('copyAddress'),
          systemImage: 'doc.on.doc',
          onPress: () => void copyText(planLocationText(location)),
        },
        url
          ? {
              id: 'share',
              title: i18n.t('shareEllipsis'),
              systemImage: 'square.and.arrow.up',
              onPress: () => share(url),
            }
          : null,
      ]}
    >
      {content}
    </ContextMenu>
  )
}
