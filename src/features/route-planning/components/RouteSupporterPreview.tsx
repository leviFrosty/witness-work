import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import SupporterBadge from '@/components/SupporterBadge'
import useTheme from '@/contexts/theme'
import useSupporterGateAnalytics from '@/hooks/useSupporterGateAnalytics'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

/**
 * Takes the place of "Find Shortest Route" for non-Supporters. They've just
 * seen their own stops, so this only says what Supporter adds and offers it,
 * without dimming or blocking the rest of the screen.
 */
export default function RouteSupporterPreview() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { headerRef, recordClick } = useSupporterGateAnalytics(
    'routePlanning',
    'today_route',
    false
  )

  const support = () =>
    navigation.navigate('Paywall', {
      source: 'feature_gate',
      feature: 'routePlanning',
      gateAttribution: recordClick(),
    })

  return (
    <Card style={{ gap: 12 }}>
      <View
        ref={headerRef}
        collapsable={false}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <Text
          style={{
            flex: 1,
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('routePlan_previewTitle')}
        </Text>
        <SupporterBadge />
      </View>
      <Text style={{ color: theme.colors.textAlt }}>
        {i18n.t('supporterPerkRouteDesc')}
      </Text>
      <ActionButton onPress={support}>{i18n.t('becomeSupporter')}</ActionButton>
    </Card>
  )
}
