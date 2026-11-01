import moment from 'moment'
import { View } from 'react-native'
import { Send as SendIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import { ChevronForwardIcon } from '@/components/ui/DirectionalIcon'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import { noteUserAction } from '@/lib/userAction'
import { usePreferences } from '@/stores/preferences'
import { RootStackNavigation } from '@/types/rootStack'
import useMonthReportExport from '@/features/service-reports/hooks/useMonthReportExport'
import { reportMonthKey } from '@/features/service-reports/lib/monthReportExport'

const DueReportRow = ({ month, year }: { month: number; year: number }) => {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const navigation = useNavigation<RootStackNavigation>()
  const markReportSubmitted = usePreferences((s) => s.markReportSubmitted)
  const { reportMenuItems } = useMonthReportExport()
  const label = i18n.t('submitMonthsReport', {
    month: moment({ year, month }).format('MMMM'),
  })

  const openReport = () =>
    navigation.navigate('ServiceReportView', { month, year })

  return (
    <ContextMenu
      accessibilityLabel={label}
      testID='due-report-row'
      onPress={openReport}
      hoverRadius={theme.numbers.borderRadiusMd}
      actions={[
        reportMenuItems(month, year),
        [
          {
            id: 'already_submitted',
            title: i18n.t('notifications_alreadySubmitted'),
            systemImage: 'checkmark.circle',
            onPress: () => {
              noteUserAction('report')
              markReportSubmitted(reportMonthKey(month, year))
            },
          },
        ],
      ]}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 44,
          paddingHorizontal: 12,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: theme.colors.accent,
          borderRadius: theme.numbers.borderRadiusMd,
          backgroundColor: theme.colors.accentTranslucent,
        }}
      >
        {largeText ? null : (
          <LucideIcon icon={SendIcon} size={16} color={theme.colors.accent} />
        )}
        <Text
          style={{
            flex: 1,
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {label}
        </Text>
        {largeText ? null : (
          <LucideIcon
            icon={ChevronForwardIcon}
            size={16}
            color={theme.colors.accent}
          />
        )}
      </View>
    </ContextMenu>
  )
}

export default DueReportRow
