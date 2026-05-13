import { useNavigation } from '@react-navigation/native'
import { Pressable, View } from 'react-native'
import { faXmark } from '@fortawesome/free-solid-svg-icons'
import moment from 'moment'

import Text from '../../../components/MyText'
import IconButton from '../../../components/IconButton'
import useTheme from '../../../contexts/theme'
import i18n from '../../../lib/locales'
import { usePreferences } from '../../../stores/preferences'
import useServiceReport from '../../../stores/serviceReport'
import { effectiveHasAnnualGoal } from '../../../lib/publisherCapabilities'
import { RootStackNavigation } from '../../../types/rootStack'
import { hasReportsInCatchUpWindow } from './ServiceYearCatchUpForm'

const ServiceYearCatchUpBanner = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const {
    serviceYearCatchUpStatus,
    installedOn,
    publisher,
    userSpecifiedHasAnnualGoal,
    set,
  } = usePreferences()

  const { serviceReports } = useServiceReport()

  // Re-verify trigger conditions every render so the banner naturally
  // disappears if the user changes publisher type to a non-annual-goal role
  // — even though `status` remains 'skipped'. Also hide when an iCloud
  // restore (or other prior data) already filled the catch-up window.
  const eligible =
    effectiveHasAnnualGoal(publisher, userSpecifiedHasAnnualGoal) &&
    moment(installedOn).month() !== 8 &&
    !hasReportsInCatchUpWindow(serviceReports, installedOn)

  if (!eligible || serviceYearCatchUpStatus !== 'skipped') return null

  return (
    <View
      style={{
        marginHorizontal: 15,
        marginTop: 8,
        backgroundColor: theme.colors.accentTranslucent,
        borderRadius: theme.numbers.borderRadiusMd,
        paddingHorizontal: 12,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <Pressable
        onPress={() => navigation.navigate('ServiceYearCatchUp')}
        style={{ flex: 1, gap: 2 }}
      >
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.text,
            fontSize: 14,
          }}
        >
          {i18n.t('serviceYearCatchUpBannerTitle')}
        </Text>
        <Text
          style={{
            color: theme.colors.textAlt,
            fontSize: 12,
            lineHeight: 16,
          }}
        >
          {i18n.t('serviceYearCatchUpBannerSubtitle')}
        </Text>
      </Pressable>
      <IconButton
        icon={faXmark}
        size={16}
        color={theme.colors.textAlt}
        onPress={() => set({ serviceYearCatchUpStatus: 'dismissed' })}
        accessibilityLabel={i18n.t('serviceYearCatchUpBannerDismissA11y')}
        style={{
          padding: 8,
        }}
      />
    </View>
  )
}

export default ServiceYearCatchUpBanner
