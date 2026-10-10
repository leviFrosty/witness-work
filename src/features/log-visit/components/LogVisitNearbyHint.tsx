import { MapPin as MapPinIcon } from 'lucide-react-native'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'

/** Offers Nearby when location hasn't been asked yet. Only a tap asks. */
export default function LogVisitNearbyHint({
  onTurnOn,
}: {
  onTurnOn: () => void
}) {
  const theme = useTheme()
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingLeft: 12,
        paddingRight: 4,
        paddingVertical: 4,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon
        icon={MapPinIcon}
        size={theme.fontSize('sm')}
        style={{ color: theme.colors.textAlt }}
      />
      <Text
        style={{
          flex: 1,
          fontSize: theme.fontSize('sm'),
          color: theme.colors.textAlt,
        }}
      >
        {i18n.t('logVisit_nearbyHint')}
      </Text>
      <Button
        testID='log-visit-nearby-turn-on'
        accessibilityRole='button'
        accessibilityLabel={`${i18n.t('logVisit_nearbyHintAction')}, ${i18n.t('logVisit_nearbyHint')}`}
        onPress={onTurnOn}
        style={{ paddingHorizontal: 10, paddingVertical: 8 }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t('logVisit_nearbyHintAction')}
        </Text>
      </Button>
    </View>
  )
}
