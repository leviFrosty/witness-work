import { View } from 'react-native'
import { MapPin as MapPinIcon } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import ContextMenu from '@/components/ui/ContextMenu'
import { useLinkActions } from '@/components/RichLinkCard'
import { liftedContent } from '@/components/ui/Copyeable'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { openURL } from '@/lib/links'
import { appleMapsUrl, formatPlanLocation } from '@/lib/placeSearch'
import type { PlanLocation } from '@/types/timeEntry'

export const planLocationText = (location: PlanLocation): string => {
  const { primary, secondary } = formatPlanLocation(location)
  return [primary, secondary].filter(Boolean).join('\n')
}

export default function PlanLocationLink({
  location,
  compact,
  interactive = true,
}: {
  location: PlanLocation

  compact?: boolean

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
      hoverRadius={theme.numbers.borderRadiusSm}
      style={liftedContent.outset}
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
      <View style={liftedContent.inset}>{content}</View>
    </ContextMenu>
  )
}
