import { useContext, useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused, useNavigation } from '@react-navigation/native'
import { X as XIcon } from 'lucide-react-native'
import { ChevronBackwardIcon } from '@/components/ui/DirectionalIcon'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import SplitSheet from '@/components/ui/SplitSheet'
import XView from '@/components/ui/layout/XView'
import { AnimationViewContext } from '@/contexts/AnimationView'
import useTheme from '@/contexts/theme'
import type { LogTimePrefill } from '@/hooks/usePlanMenuActions'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import DayHistoryHeader from '@/features/service-reports/components/DayHistoryHeader'
import DayHistoryView, {
  type PlanDetailsSlot,
  type PlanFormSlot,
} from '@/features/service-reports/components/DayHistoryView'
import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

type DayForm =
  | { kind: 'time'; existingReport?: TimeEntry; prefill?: LogTimePrefill }
  | { kind: 'planDetails'; plan: RootStackParamList['Plan Details'] }
  | {
      kind: 'plan'
      params?: RootStackParamList['PlanDay']
      from?: RootStackParamList['Plan Details']
    }

const HORIZONTAL_PADDING = 24

const REVEAL_FORM_DELAY_MS = 300

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: TimeEntry[] | null

  renderFooter?: (
    date: Date,
    onNavigate: (navigate: () => void) => void
  ) => React.ReactNode

  renderDayPlanFooter?: (plan: DayPlan) => React.ReactNode

  renderPlanForm?: (slot: PlanFormSlot) => React.ReactNode

  renderPlanDetails?: {
    actions: (slot: PlanDetailsSlot) => React.ReactNode
    body: (slot: PlanDetailsSlot) => React.ReactNode
  }

  onHeightChange?: (height: number) => void
}

const SelectedDateSheet: React.FC<Props> = ({
  sheet,
  setSheet,
  thisMonthsReports,
  renderFooter,
  renderDayPlanFooter,
  renderPlanForm,
  renderPlanDetails,
  onHeightChange,
}) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()

  const animation = useContext(AnimationViewContext)
  const [form, setForm] = useState<DayForm | null>(null)

  const dayKey = sheet.date.getTime()
  const [shown, setShown] = useState({ open: sheet.open, dayKey })
  if (shown.open !== sheet.open || shown.dayKey !== dayKey) {
    setShown({ open: sheet.open, dayKey })
    if (sheet.open) setForm(null)
  }

  const pendingNavigation = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sheet.open && pendingNavigation.current) {
      const navigate = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(navigate, 125)
    }
  }, [sheet.open])

  const focused = useIsFocused()
  const navigation = useNavigation<RootStackNavigation>()

  const close = () => setSheet({ ...sheet, open: false })

  const scrollRef = useRef<ScrollView>(null)
  const revealForm = (card: View) =>
    setTimeout(() => {
      const scrollView = scrollRef.current
      if (!scrollView) return
      card.measureLayout(
        scrollView as unknown as View,
        (_x, y) =>
          scrollView.scrollTo({ y: Math.max(0, y - 8), animated: true }),
        () => {}
      )
    }, REVEAL_FORM_DELAY_MS)

  const navigateAfterClosing = (navigate: () => void) => {
    pendingNavigation.current = navigate
    close()
  }

  const back = () =>
    setForm(
      form?.kind === 'plan' && form.from
        ? { kind: 'planDetails', plan: form.from }
        : null
    )

  const openPlan = (plan: RootStackParamList['Plan Details']) =>
    setForm({ kind: 'planDetails', plan })

  const planDetailsSlot: PlanDetailsSlot | null =
    form?.kind === 'planDetails'
      ? {
          plan: form.plan,
          onEdit: (params) =>
            setForm({ kind: 'plan', params, from: form.plan }),
          onOpenPlan: openPlan,
          onGone: () => setForm(null),
          onNavigate: navigateAfterClosing,
        }
      : null

  const title = !form
    ? undefined
    : form.kind === 'planDetails'
      ? 'plan'
      : form.kind === 'plan'
        ? form.params
          ? 'editPlan'
          : 'createPlan'
        : form.existingReport
          ? 'updateTime'
          : 'addTime'

  const closeButton = (
    <IconButton
      noTransform
      frame
      icon={XIcon}
      size={16}
      color={theme.colors.textAlt}
      onPress={close}
      accessibilityLabel={i18n.t('close')}
      style={{
        backgroundColor: theme.colors.background,
        borderRadius: 999,
        padding: 7,
      }}
    />
  )

  const header = form ? (
    <XView
      style={{
        paddingLeft: HORIZONTAL_PADDING - 20,
        paddingRight: HORIZONTAL_PADDING,
        paddingBottom: 4,
      }}
    >
      {}
      <IconButton
        noTransform
        icon={ChevronBackwardIcon}
        size={28}
        color={theme.colors.text}
        onPress={back}
        accessibilityLabel={i18n.t('goBack')}
        hitSlop={{ top: 8, bottom: 8, left: 12, right: 8 }}
        style={{
          width: 44,
          height: 44,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      />
      <Text
        accessibilityRole='header'
        style={{
          flex: 1,

          marginStart: -6,
          color: theme.colors.text,
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {i18n.t(title!)}
      </Text>
      {planDetailsSlot ? (
        <XView style={{ gap: 24, marginEnd: 20 }}>
          {renderPlanDetails?.actions(planDetailsSlot)}
        </XView>
      ) : null}
      {closeButton}
    </XView>
  ) : (
    <XView
      style={{
        alignItems: 'flex-start',
        paddingHorizontal: HORIZONTAL_PADDING,
        paddingBottom: 12,
        gap: 12,
      }}
    >
      <View style={{ flex: 1 }}>
        <DayHistoryHeader
          date={sheet.date}
          serviceReports={thisMonthsReports || []}
        />
      </View>
      {closeButton}
    </XView>
  )

  return (
    <SplitSheet
      open={sheet.open}
      hidden={!focused}
      onOpenChange={(open) => setSheet({ ...sheet, open })}
      header={header}
      onBackPress={form ? back : undefined}
      onHeightChange={onHeightChange}
    >
      <AnimationViewContext.Provider value={animation}>
        {form?.kind === 'plan' ? (
          renderPlanForm?.({
            date: sheet.date,
            layout: 'docked',
            params: form.params,

            onDone: (target) =>
              setForm(
                form.from && target
                  ? { kind: 'planDetails', plan: target }
                  : null
              ),
          })
        ) : planDetailsSlot ? (
          <ScrollView
            contentContainerStyle={{
              gap: 20,
              paddingHorizontal: HORIZONTAL_PADDING,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
            }}
          >
            {renderPlanDetails?.body(planDetailsSlot)}
          </ScrollView>
        ) : form?.kind === 'time' ? (
          <TimeEntryForm
            existingReport={form.existingReport}
            date={form.prefill?.date ?? sheet.date}
            hours={form.prefill?.hours}
            minutes={form.prefill?.minutes}
            categoryId={form.prefill?.categoryId}
            source='day_sheet'
            onDone={() => setForm(null)}
          />
        ) : (
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps='handled'
            automaticallyAdjustKeyboardInsets
            contentContainerStyle={{
              gap: 10,
              paddingHorizontal: HORIZONTAL_PADDING,
              paddingTop: 8,
              paddingBottom: insets.bottom + 24,
            }}
          >
            <DayHistoryView
              key={dayKey}
              date={sheet.date}
              serviceReports={thisMonthsReports || []}
              onTimeReportPress={(report) =>
                setForm({ kind: 'time', existingReport: report })
              }
              onAddTime={() => setForm({ kind: 'time' })}
              onLogTime={(prefill) => setForm({ kind: 'time', prefill })}
              onPlanDay={
                renderPlanForm ? () => setForm({ kind: 'plan' }) : undefined
              }
              onNavigate={navigateAfterClosing}
              onPlanOpen={renderPlanDetails ? openPlan : undefined}
              onPlanEdit={
                renderPlanForm
                  ? (params) => setForm({ kind: 'plan', params })
                  : undefined
              }
              renderDayPlanFooter={renderDayPlanFooter}
              inlineForms
              renderPlanForm={renderPlanForm}
              onFormOpen={revealForm}
              onExpandTime={(params) => navigation.navigate('Add Time', params)}
              onExpandPlan={(params) => navigation.navigate('PlanDay', params)}
            />
            {renderFooter?.(sheet.date, navigateAfterClosing)}
          </ScrollView>
        )}
      </AnimationViewContext.Provider>
    </SplitSheet>
  )
}

export default SelectedDateSheet
