import { View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'
import {
  OUTCOME_ICON,
  OUTCOME_LABEL,
  outcomeColor,
} from '@/features/territories/lib/outcomes'
import type { TerritoryMarker } from '@/features/territories/lib/territoryMap'

export default function TerritoryMarkerCard({
  marker,
  streetName,
  onOpenStreet,
  onClose,
}: {
  marker: TerritoryMarker
  streetName: string | undefined
  onOpenStreet: (() => void) | null
  onClose: () => void
}) {
  const theme = useTheme()
  const outcome = marker.kind === 'door' ? marker.outcome : 'doNotCall'
  const color = outcomeColor(outcome, theme.colors)
  const date = formatDate(marker.at, { style: 'medium' })
  const details =
    marker.kind === 'door'
      ? [
          `${i18n.t(OUTCOME_LABEL[outcome])} · ${date}`,
          marker.tries > 1 &&
            i18n.t('territories.tries', { count: marker.tries }),
          marker.by &&
            i18n.t('territories.map.recordedBy', { name: marker.by.name }),
        ]
      : [
          i18n.t(OUTCOME_LABEL[outcome]),
          i18n.t('territories.doNotCallEntrySince', { date }),
        ]

  return (
    <View
      testID='territory-marker-card'
      style={{
        borderRadius: inputLayout.sectionRadius,
        borderCurve: 'continuous',
        backgroundColor: theme.colors.card,
        paddingTop: 18,
        paddingBottom: onOpenStreet ? 16 : 20,
        paddingHorizontal: 20,
        gap: 14,
        shadowColor: '#000',
        shadowOpacity: 0.18,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 4 },
        elevation: 6,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            marginTop: 2,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: color,
          }}
        >
          <LucideIcon
            icon={OUTCOME_ICON[outcome]}
            size={18}
            color={theme.colors.textInverse}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            testID='territory-marker-card-title'
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {marker.address}
          </Text>
          {details.filter(Boolean).map((line, index) => (
            <Text
              key={index}
              style={{
                color: index === 0 ? color : theme.colors.textAlt,
                fontFamily: index === 0 ? theme.fonts.semiBold : undefined,
              }}
            >
              {line}
            </Text>
          ))}
        </View>
        <IconButton
          frame
          icon={XIcon}
          size={18}
          color={theme.colors.textAlt}
          onPress={onClose}
          accessibilityLabel={i18n.t('territories.map.closeCard')}
          testID='territory-marker-card-close'
        />
      </View>
      {onOpenStreet && streetName && (
        <Button
          variant='outline'
          onPress={onOpenStreet}
          testID='territory-marker-card-open-street'
          style={{
            minHeight: 44,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 22,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('territories.map.openStreet', { street: streetName })}
          </Text>
        </Button>
      )}
    </View>
  )
}
