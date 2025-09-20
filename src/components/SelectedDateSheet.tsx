import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import { ServiceReport } from '../types/serviceReport'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from './ActionButton'
import XView from './layout/XView'
import Button from './Button'
import DayHistoryView from './DayHistoryView'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: ServiceReport[] | null
  onAddTime?: () => void
  onPlanDay?: () => void
  onNavigateToPlanDay?: (existingDayPlanId: string) => void
  onNavigateToRecurringPlan?: (
    existingRecurringPlanId: string,
    recurringPlanDate: string
  ) => void
  onEditTimeReport?: (report: ServiceReport) => void
}

const SelectedDateSheet: React.FC<Props> = ({
  sheet,
  setSheet,
  thisMonthsReports,
  onAddTime,
  onPlanDay,
  onNavigateToPlanDay,
  onNavigateToRecurringPlan,
  onEditTimeReport,
}) => {
  const theme = useTheme()

  return (
    <Sheet
      open={sheet.open}
      onOpenChange={(o: boolean) => setSheet({ ...sheet, open: o })}
      dismissOnSnapToBottom
      modal
      snapPoints={[85]}
    >
      <Sheet.Handle />
      <Sheet.Overlay zIndex={100_000 - 1} />
      <Sheet.Frame>
        <View
          style={{
            paddingHorizontal: 30,
            gap: 10,
            flex: 1,
            paddingTop: 30,
            paddingBottom: 50,
            backgroundColor: theme.colors.backgroundLighter,
          }}
        >
          <KeyboardAwareScrollView contentContainerStyle={{ minHeight: 10 }}>
            <DayHistoryView
              date={sheet.date}
              serviceReports={thisMonthsReports || []}
              showHeader={true}
              onDayPlanPress={(plan) => {
                setSheet({ ...sheet, open: false })
                onNavigateToPlanDay?.(plan.id)
              }}
              onRecurringPlanPress={(plan) => {
                setSheet({ ...sheet, open: false })
                onNavigateToRecurringPlan?.(plan.id, sheet.date.toISOString())
              }}
              onTimeReportPress={(report) => {
                setSheet({ ...sheet, open: false })
                onEditTimeReport?.(report)
              }}
            />
          </KeyboardAwareScrollView>
          <XView style={{ maxHeight: 70 }}>
            <View style={{ flexGrow: 1 }}>
              <ActionButton
                onPress={() => {
                  setSheet({
                    ...sheet,
                    open: false,
                  })
                  onAddTime?.()
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('addTime')}
                </Text>
              </ActionButton>
            </View>
            <Button
              onPress={() => {
                setSheet({
                  ...sheet,
                  open: false,
                })
                onPlanDay?.()
              }}
              style={{
                paddingHorizontal: 40,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusSm,
                height: '100%',
                flexGrow: 1,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ textAlign: 'center' }}>{i18n.t('planDay')}</Text>
            </Button>
          </XView>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default SelectedDateSheet
