import { useContext, useEffect, useRef, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useIsFocused } from '@react-navigation/native'
import { ChevronLeft as ChevronLeftIcon, X as XIcon } from 'lucide-react-native'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import SplitSheet from '@/components/ui/SplitSheet'
import XView from '@/components/ui/layout/XView'
import { AnimationViewContext } from '@/contexts/AnimationView'
import useTheme from '@/contexts/theme'
import type { LogTimePrefill } from '@/hooks/usePlanMenuActions'
import i18n from '@/lib/locales'
import { DayPlan, TimeEntry } from '@/types/timeEntry'
import DayHistoryHeader from '@/features/service-reports/components/DayHistoryHeader'
import DayHistoryView, {
  type PlanFormSlot,
} from '@/features/service-reports/components/DayHistoryView'
import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'

export type SelectedDateSheetState = {
  open: boolean
  date: Date
}

/**
 * A form in place of the day: Add Time for a new entry, maybe from a Plan, or
 * one to change; or a new Plan for the day.
 */
type DayForm =
  | { kind: 'time'; existingReport?: TimeEntry; prefill?: LogTimePrefill }
  | { kind: 'plan' }

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

  const closeButton = (
    <IconButton
      noTransform
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
        paddingLeft: HORIZONTAL_PADDING - 8,
        paddingRight: HORIZONTAL_PADDING,
        paddingBottom: 8,
        gap: 4,
      }}
    >
      <IconButton
        noTransform
        icon={ChevronLeftIcon}
        size={24}
        color={theme.colors.text}
        onPress={() => setForm(null)}
        accessibilityLabel={i18n.t('goBack')}
      />
      <Text
        accessibilityRole='header'
        style={{
          flex: 1,
          color: theme.colors.text,
          fontSize: theme.fontSize('lg'),
          fontFamily: theme.fonts.bold,
        }}
      >
        {i18n.t(
          form.kind === 'plan'
            ? 'createPlan'
            : form.existingReport
              ? 'updateTime'
              : 'addTime'
        )}
      </Text>
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
      onBackPress={form ? () => setForm(null) : undefined}
      onHeightChange={onHeightChange}
    >
      <AnimationViewContext.Provider value={animation}>
        {form?.kind === 'plan' ? (
          renderPlanForm?.({
            date: sheet.date,
            layout: 'docked',
            onDone: () => setForm(null),
          })
        ) : form ? (
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
