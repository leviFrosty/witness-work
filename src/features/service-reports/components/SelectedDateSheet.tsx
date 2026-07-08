import { View } from 'react-native'
import { Sheet } from 'tamagui'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import useTheme from '@/contexts/theme'
import { TimeEntry } from '@/types/timeEntry'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import ActionButton from '@/components/ui/ActionButton'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'
import DayHistoryView from '@/features/service-reports/components/DayHistoryView'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: TimeEntry[] | null
  onAddTime?: () => void
  onPlanDay?: () => void
  onNavigateToPlanDay?: (existingDayPlanId: string) => void
  onNavigateToRecurringPlan?: (
    existingRecurringPlanId: string,
    recurringPlanDate: string
  ) => void
  onEditTimeReport?: (report: TimeEntry) => void
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
          {/* Must flex — RN 0.86's Yoga no longer clamps an unflexed scroll
              view to its parent's bounds, so without this it sizes to its
              content and pushes the action bar below off-screen. */}
          <KeyboardAwareScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ minHeight: 10 }}
          >
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
          <XView style={{ maxHeight: 70, gap: 8 }}>
            <Button
              noTransform
              onPress={() => {
                setSheet({
                  ...sheet,
                  open: false,
                })
                onAddTime?.()
              }}
              style={{
                paddingHorizontal: 20,
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.background,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusSm,
                height: '100%',
                flexShrink: 0,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ textAlign: 'center' }}>{i18n.t('addTime')}</Text>
            </Button>
            <View style={{ flex: 1 }}>
              <ActionButton
                noTransform
                onPress={() => {
                  setSheet({
                    ...sheet,
                    open: false,
                  })
                  onPlanDay?.()
                }}
              >
                <Text
                  style={{
                    color: theme.colors.textInverse,
                    fontSize: theme.fontSize('lg'),
                    fontFamily: theme.fonts.semiBold,
                  }}
                >
                  {i18n.t('planDay')}
                </Text>
              </ActionButton>
            </View>
          </XView>
        </View>
      </Sheet.Frame>
    </Sheet>
  )
}

export default SelectedDateSheet
