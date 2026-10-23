import { ScrollView, View } from 'react-native'
import { X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { getReadableTextColor } from '@/lib/color'
import i18n from '@/lib/locales'
import MapCard from '@/features/map/components/MapCard'
import {
  cardToneColor,
  pinInitials,
  type CardLine,
} from '@/features/map/lib/contactPins'
import type { ContactMarker } from '@/features/map/types/map'

/** Rows that show before the list scrolls. */
const VISIBLE_ROWS = 4
const ROW_HEIGHT = 52

/**
 * The Contacts gathered in one pin at one place (an apartment building), most
 * pressing first, each with its card's line and its unit. Picking one selects
 * them as a pin tap would.
 */
export default function MapGroupList({
  title,
  members,
  lineFor,
  activeId,
  onSelect,
  onClose,
}: {
  title: string
  members: ContactMarker[]
  lineFor: (contact: ContactMarker) => CardLine | null
  activeId: string | undefined
  onSelect: (id: string) => void
  onClose: () => void
}) {
  const theme = useTheme()

  return (
    <MapCard fill={false} onAccessibilityEscape={onClose}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text
          numberOfLines={1}
          accessibilityRole='header'
          style={{
            flex: 1,
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {title}
        </Text>
        <Button
          noTransform
          hitSlop={0}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('map_group_close')}
          onPress={onClose}
          style={{
            width: 44,
            height: 44,
            marginVertical: -8,
            marginEnd: -8,
            padding: 0,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'transparent',
          }}
        >
          <LucideIcon icon={XIcon} size={20} color={theme.colors.text} />
        </Button>
      </View>
      <ScrollView
        style={{ maxHeight: VISIBLE_ROWS * ROW_HEIGHT + ROW_HEIGHT / 2 }}
        bounces={members.length > VISIBLE_ROWS}
      >
        {members.map((contact) => {
          const line = lineFor(contact)
          const unit = contact.address?.line2?.trim()
          const active = contact.id === activeId
          return (
            <Button
              key={contact.id}
              noTransform
              hitSlop={0}
              accessibilityRole='button'
              accessibilityLabel={[contact.name, line?.text, unit]
                .filter(Boolean)
                .join(', ')}
              accessibilityState={{ selected: active }}
              onPress={() => onSelect(contact.id)}
              style={{
                minHeight: ROW_HEIGHT,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 8,
                marginHorizontal: -8,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: active
                  ? theme.colors.accentTranslucent
                  : 'transparent',
              }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: contact.pinColor,
                }}
              >
                <Text
                  maxFontSizeMultiplier={1.2}
                  style={{
                    fontSize: 11,
                    fontFamily: theme.fonts.bold,
                    color: getReadableTextColor(contact.pinColor),
                  }}
                >
                  {pinInitials(contact.name)}
                </Text>
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: theme.fonts.semiBold }}
                >
                  {contact.name}
                </Text>
                {line && (
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: theme.fontSize('sm'),
                      fontFamily: theme.fonts.semiBold,
                      color: cardToneColor(line.tone, theme.colors),
                    }}
                  >
                    {line.text}
                  </Text>
                )}
              </View>
              {!!unit && (
                <Text
                  numberOfLines={1}
                  style={{
                    maxWidth: '30%',
                    fontSize: theme.fontSize('sm'),
                    color: theme.colors.textAlt,
                  }}
                >
                  {unit}
                </Text>
              )}
            </Button>
          )
        })}
      </ScrollView>
    </MapCard>
  )
}
