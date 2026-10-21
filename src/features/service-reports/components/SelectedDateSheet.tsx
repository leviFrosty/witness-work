import { useContext, useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
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
import type { RootStackParamList } from '@/types/rootStack'
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

/**
 * What shows in place of the day: Add Time for a new entry, maybe from a Plan,
 * or one to change; one of the day's Plans; or the Plan form, for a new Plan or
 * one to change, coming back to that Plan if it was opened from there.
 */
type DayForm =
  | { kind: 'time'; existingReport?: TimeEntry; prefill?: LogTimePrefill }
  | { kind: 'planDetails'; plan: RootStackParamList['Plan Details'] }
  | {
      kind: 'plan'
      params?: RootStackParamList['PlanDay']
      from?: RootStackParamList['Plan Details']
    }

const HORIZONTAL_PADDING = 24
/** Long enough for an unfolded form to lay out before scrolling to it. */
const REVEAL_FORM_DELAY_MS = 300

interface Props {
  sheet: SelectedDateSheetState
  setSheet: React.Dispatch<React.SetStateAction<SelectedDateSheetState>>
  thisMonthsReports: TimeEntry[] | null
  /**
   * Extra content under the day's history (e.g. Buddies' plans). Its menus
   * navigate through `onNavigate`, which closes the sheet first.
   */
  renderFooter?: (
    date: Date,
    onNavigate: (navigate: () => void) => void
  ) => React.ReactNode
  /** Extra lines under a one-time Plan's row, e.g. who the Plan is with. */
  renderDayPlanFooter?: (plan: DayPlan) => React.ReactNode
  /** The Plan form, for planning the day in the sheet. */
  renderPlanForm?: (slot: PlanFormSlot) => React.ReactNode
  /** Plan Details, for showing one of the day's Plans in the sheet. */
  renderPlanDetails?: {
    actions: (slot: PlanDetailsSlot) => React.ReactNode
    body: (slot: PlanDetailsSlot) => React.ReactNode
  }
  /** The sheet's resting height while open, and 0 once closed. */
  onHeightChange?: (height: number) => void
}

/**
 * A day's time and plans in a split sheet over the bottom of the screen, so the
 * calendar or list the day was picked from stays in view above it. A day with
 * no time or no Plans folds their forms into its list. Add Time, editing an
 * entry, a Plan's Log as Time, and Plan Day open their form in the sheet, and
 * it comes back to the day once saved.
 */
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
  // The sheet renders through a portal, outside this screen's providers; the
  // time form celebrates a new entry with this one's confetti.
  const animation = useContext(AnimationViewContext)
  const [form, setForm] = useState<DayForm | null>(null)
  // A newly opened or newly picked day starts on its overview. A closing sheet
  // keeps what it shows until it's gone.
  const dayKey = sheet.date.getTime()
  const [shown, setShown] = useState({ open: sheet.open, dayKey })
  if (shown.open !== sheet.open || shown.dayKey !== dayKey) {
    setShown({ open: sheet.open, dayKey })
    if (sheet.open) setForm(null)
  }

  // Navigation chosen from a row or its context menu waits for the sheet to
  // close, or the pushed screen would land underneath the sheet.
  const pendingNavigation = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!sheet.open && pendingNavigation.current) {
      const navigate = pendingNavigation.current
      pendingNavigation.current = null
      setTimeout(navigate, 125)
    }
  }, [sheet.open])

  // The screen above stays usable, so it can open another screen, and a form
  // here can open the note editor: the sheet steps aside for it, keeping what
  // it shows for when the screen is back.
  const focused = useIsFocused()

  const close = () => setSheet({ ...sheet, open: false })

  // A form unfolded low in the day scrolls up to the top of the sheet, once
  // it has had a moment to open.
  const scrollRef = useRef<ScrollView>(null)
  const revealForm = (card: View) =>
    setTimeout(() => {
      const scrollView = scrollRef.current
      if (!scrollView) return
      card.measureLayout(
        // @ts-expect-error — RN accepts a host component ref here.
        scrollView,
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

  // The header is the sheet's drag handle too, so its buttons get real frames.
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
      {/* A real 44pt frame, plus slop: this header is also the sheet's drag
          handle, so a thin target loses taps to the drag. */}
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
          // Tucks into the chevron's frame, where it sat before.
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
            // An edited Plan opened from its details goes back to them, where
            // it is now (a Recurring Plan's date may have become its own).
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
            // The day's inline Plan form has a title field.
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
            />
            {renderFooter?.(sheet.date, navigateAfterClosing)}
          </ScrollView>
        )}
      </AnimationViewContext.Provider>
    </SplitSheet>
  )
}

export default SelectedDateSheet
