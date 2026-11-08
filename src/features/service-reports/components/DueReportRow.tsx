import moment from 'moment'
import { View } from 'react-native'
import { Send as SendIcon } from 'lucide-react-native'
import { useNavigation } from '@react-navigation/native'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PullDownMenu from '@/components/ui/PullDownMenu'
import useTheme from '@/contexts/theme'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import i18n from '@/lib/locales'
import { toast } from '@/stores/toasts'
import { RootStackNavigation } from '@/types/rootStack'
import useMonthReportExport, {
  markReportNotSent,
  markReportSent,
} from '@/features/service-reports/hooks/useMonthReportExport'

const DueReportRow = ({ month, year }: { month: number; year: number }) => {
  const theme = useTheme()

  const largeText = useAccessibilityTextSize()
  const navigation = useNavigation<RootStackNavigation>()
  const { reportMenuItems } = useMonthReportExport()
  const monthName = moment({ year, month }).format('MMMM')
  const label = i18n.t('submitMonthsReport', { month: monthName })

  const openReport = () =>
    navigation.navigate('ServiceReportView', { month, year })

  const markSent = () => {
    markReportSent(month, year, 'context_menu')
    toast.undo({
      title: i18n.t('monthsReportMarkedSent', { month: monthName }),
      onUndo: () => markReportNotSent(month, year, 'context_menu'),
    })
  }

  const actions = [
    reportMenuItems(month, year).map((item) =>
      item.id === 'mark_sent' ? { ...item, onPress: markSent } : item
    ),
  ]

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingEnd: 20,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
    >
      <ContextMenu
        accessibilityLabel={label}
        testID='due-report-row'
        onPress={openReport}
        actions={actions}
        style={{ flex: 1 }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            minHeight: 48,
            paddingStart: 20,
            paddingEnd: 12,
            paddingVertical: 10,
          }}
        >
          {largeText ? null : (
            <LucideIcon icon={SendIcon} size={16} color={theme.colors.accent} />
          )}
          <Text
            style={{
              flex: 1,
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('monthsReportDue', { month: monthName })}
          </Text>
          <Text
            style={{
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('sm'),
            }}
          >
            {i18n.t('submit')}
          </Text>
        </View>
      </ContextMenu>
      <PullDownMenu
        actions={actions}
        accessibilityLabel={i18n.t('moreActionsFor', { name: label })}
        testID='due-report-menu'
      />
    </View>
  )
}

export default DueReportRow
