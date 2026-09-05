import {
  ArrowLeft as ArrowLeftIcon,
  ArrowRight as ArrowRightIcon,
  Check as CheckIcon,
  Copy as CopyIcon,
  Earth as EarthIcon,
  ExternalLink as ExternalLinkIcon,
  Hourglass as HourglassIcon,
  Pencil as PencilIcon,
  RotateCcw as RotateCcwIcon,
  Share as ShareIcon,
  X as XIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Alert, Keyboard, ScrollView, Share, View } from 'react-native'
import { TextArea } from 'tamagui'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import moment from 'moment'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { LayoutChangeEvent } from 'react-native'
import Svg, { Path } from 'react-native-svg'
import {
  BackPaperSheet,
  PaperSurface,
  PaperRow,
  HandwrittenValue,
  PAPER_INK,
  PAPER_INK_SOFT,
  PAPER_LABEL,
  PAPER_LINE,
  PAPER_WIDTH,
  PAPER_HEIGHT_MIN,
} from '@/components/ReportPaper'

import IconButton from '@/components/ui/IconButton'
import Button from '@/components/ui/Button'
import SplitButton, { SplitButtonAction } from '@/components/ui/SplitButton'
import Text from '@/components/ui/MyText'
import { exportMethodSelectionOptions } from '@/components/DefaultExportMethodSelector'
import { usePreferences, type ReportExportMethod } from '@/stores/preferences'
import useTheme from '@/contexts/theme'
import i18n, { _i18n } from '@/lib/locales'
import Haptics from '@/lib/haptics'
import useMonthReportData from '@/features/service-reports/hooks/useMonthReportData'
import {
  buildHourglassLink,
  buildNwPublisherLink,
} from '@/features/service-reports/lib/submitLinks'
import { openURL } from '@/lib/links'
import { useHandwritingFonts } from '@/lib/handwritingFont'
import useUser from '@/hooks/useUser'
import { RootStackParamList } from '@/types/rootStack'

type Props = NativeStackScreenProps<RootStackParamList, 'ServiceReportView'>

/** Lucide icons for the submit segment itself. */
const exportMethodCtaIcons = {
  copy: CopyIcon,
  share: ShareIcon,
  hourglass: HourglassIcon,
  nwpublisher: EarthIcon,
} as const satisfies Record<ReportExportMethod, unknown>

/** SF Symbols for the native method menu rows. */
const exportMethodSfSymbols = {
  copy: 'doc.on.doc',
  share: 'square.and.arrow.up',
  hourglass: 'hourglass',
  nwpublisher: 'globe.americas',
} as const satisfies Record<ReportExportMethod, string>

const SUBMIT_CONFIRMATION_DURATION_MS = 2000

const ServiceReportViewScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { month, year } = route.params
  const data = useMonthReportData(month, year)
  const { name, hasName } = useUser()
  const {
    defaultExportMethod,
    markReportSubmitted,
    set,
    setReportCommentOverride,
    clearReportCommentOverride,
  } = usePreferences()

  const reportMonthKey = useMemo(
    () => moment().month(month).year(year).format('YYYY-MM'),
    [month, year]
  )

  const monthYearLabel = useMemo(
    () => moment().month(month).year(year).format('MMMM YYYY'),
    [month, year]
  )
  const selectedMonth = useMemo(
    () => moment().month(month).year(year).startOf('month'),
    [month, year]
  )
  const canNavigateForward = selectedMonth.isBefore(moment(), 'month')
  const navigateMonth = useCallback(
    (direction: -1 | 1) => {
      const next = moment(selectedMonth).add(direction, 'month')
      navigation.setParams({ month: next.month(), year: next.year() })
    },
    [navigation, selectedMonth]
  )

  const { regular: handwritingFont, bold: handwritingFontBold } =
    useHandwritingFonts(_i18n.locale)

  const [paperHeight, setPaperHeight] = useState(PAPER_HEIGHT_MIN)
  const handlePaperLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const measured = Math.ceil(e.nativeEvent.layout.height)
      const next = Math.max(measured, PAPER_HEIGHT_MIN)
      if (Math.abs(next - paperHeight) > 2) setPaperHeight(next)
    },
    [paperHeight]
  )

  const [isEditingNotes, setIsEditingNotes] = useState(false)
  const [notesDraft, setNotesDraft] = useState('')
  const [isSubmitConfirmed, setIsSubmitConfirmed] = useState(false)
  const submitConfirmationTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null)

  useEffect(() => {
    setIsEditingNotes(false)
    setNotesDraft('')
    setIsSubmitConfirmed(false)
    Keyboard.dismiss()
  }, [month, year])

  useEffect(
    () => () => {
      if (submitConfirmationTimerRef.current !== null) {
        clearTimeout(submitConfirmationTimerRef.current)
      }
    },
    []
  )

  const confirmSubmission = useCallback(() => {
    markReportSubmitted(reportMonthKey)
    setIsSubmitConfirmed(true)
    Haptics.success()

    if (submitConfirmationTimerRef.current !== null) {
      clearTimeout(submitConfirmationTimerRef.current)
    }
    submitConfirmationTimerRef.current = setTimeout(() => {
      submitConfirmationTimerRef.current = null
      setIsSubmitConfirmed(false)
    }, SUBMIT_CONFIRMATION_DURATION_MS)
  }, [markReportSubmitted, reportMonthKey])

  const handleStartEditNotes = useCallback(() => {
    setNotesDraft(data.notes)
    setIsEditingNotes(true)
  }, [data.notes])

  const handleSaveNotes = useCallback(() => {
    // Saving text identical to the auto-generated comments is a no-op override
    // — drop it so the reset affordance doesn't linger for nothing.
    if (notesDraft === data.defaultNotes) {
      clearReportCommentOverride(reportMonthKey)
    } else {
      setReportCommentOverride(reportMonthKey, notesDraft)
    }
    setIsEditingNotes(false)
  }, [
    notesDraft,
    data.defaultNotes,
    reportMonthKey,
    setReportCommentOverride,
    clearReportCommentOverride,
  ])

  const handleResetNotes = useCallback(() => {
    Alert.alert(
      i18n.t('resetCommentsConfirm_title'),
      i18n.t('resetCommentsConfirm_description'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('reset'),
          style: 'destructive',
          onPress: () => {
            clearReportCommentOverride(reportMonthKey)
            setIsEditingNotes(false)
          },
        },
      ]
    )
  }, [clearReportCommentOverride, reportMonthKey])

  const handleShareAction = useCallback(
    async (action: string) => {
      if (action === 'copy') {
        await Clipboard.setStringAsync(data.reportAsString())
        confirmSubmission()
        return
      }
      if (action === 'share') {
        await Share.share({ message: data.reportAsString() })
        confirmSubmission()
        return
      }

      // A user-edited comment replaces the auto-generated overage remark.
      const remarks = data.hasNotesOverride
        ? data.notes || undefined
        : data.creditOverageHours > 0
          ? i18n.t('creditOverageInTheAmountOf', {
              count: data.creditOverageHours,
            })
          : undefined

      if (action === 'hourglass') {
        await openURL(
          buildHourglassLink({
            month: month + 1,
            year,
            minutes: data.hourglassMinutes,
            studies: data.studies,
            remarks,
          })
        )
        confirmSubmission()
      } else if (action === 'nwpublisher' && data.isLastMonth) {
        await openURL(
          buildNwPublisherLink({
            sharedInMinistry: data.sharedInMinistry,
            hours: data.showHours ? data.hours : undefined,
            credit: data.credit,
            bibleStudies: data.studies,
            remarks,
          })
        )
        confirmSubmission()
      }
    },
    [confirmSubmission, data, month, year]
  )

  // One-tap submit via the user's default method, always available on any
  // report. Records the submission (which clears the Home-screen reminder for
  // the previous month) and leaves the report open. NW Publisher only accepts
  // the previous month's report, so the CTA disables outside that window.
  const submitDisabled =
    defaultExportMethod === 'nwpublisher' && !data.isLastMonth
  const submitCtaLabel = useMemo(() => {
    switch (defaultExportMethod) {
      case 'hourglass':
        return i18n.t('submitToApp', { app: i18n.t('hourglass') })
      case 'nwpublisher':
        return i18n.t('submitToApp', { app: i18n.t('nwPublisher') })
      case 'share':
        return i18n.t('share')
      case 'copy':
      default:
        return i18n.t('copyToClipboard')
    }
  }, [defaultExportMethod])

  const handleSubmitCta = useCallback(() => {
    // Mid-edit, the first press commits the comment draft (the report data in
    // this render still holds the pre-edit text); the next press submits.
    if (isEditingNotes) {
      handleSaveNotes()
      return
    }
    handleShareAction(defaultExportMethod)
  }, [isEditingNotes, handleSaveNotes, handleShareAction, defaultExportMethod])

  // Commit any in-progress comment edit before the popover takes over, so a
  // method switched from the menu submits the fresh text, and drop the
  // keyboard while the menu is up.
  const handleMenuOpen = useCallback(() => {
    if (isEditingNotes) handleSaveNotes()
    Keyboard.dismiss()
  }, [isEditingNotes, handleSaveNotes])

  const methodActions: SplitButtonAction[] = useMemo(
    () =>
      exportMethodSelectionOptions.map((opt) => ({
        id: opt.value,
        title: opt.label,
        sfSymbol: exportMethodSfSymbols[opt.value],
      })),
    []
  )

  // Hourglass / NW Publisher hand off to another app or website — flag that
  // on the CTA with an external-link icon.
  const submitIsExternal =
    defaultExportMethod === 'hourglass' || defaultExportMethod === 'nwpublisher'

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: 20,
        paddingHorizontal: 10,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        <IconButton
          icon={XIcon}
          size={18}
          onPress={() => navigation.goBack()}
        />
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
            color: theme.colors.text,
          }}
        >
          {i18n.t('fieldServiceReport')}
        </Text>
        {/* Spacer mirroring the close button so the title stays centered */}
        <View style={{ width: 18 }} />
      </View>

      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 6,
          paddingBottom: 8,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Button
          accessibilityLabel={moment(selectedMonth)
            .subtract(1, 'month')
            .format('MMMM YYYY')}
          onPress={() => navigateMonth(-1)}
          style={monthNavButtonStyle(theme)}
        >
          <LucideIcon
            icon={ArrowLeftIcon}
            size={15}
            color={theme.colors.textAlt}
          />
          <Text style={{ color: theme.colors.textAlt }}>
            {moment(selectedMonth).subtract(1, 'month').format('MMM')}
          </Text>
        </Button>

        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('md'),
          }}
        >
          {monthYearLabel}
        </Text>

        {canNavigateForward ? (
          <Button
            accessibilityLabel={moment(selectedMonth)
              .add(1, 'month')
              .format('MMMM YYYY')}
            onPress={() => navigateMonth(1)}
            style={monthNavButtonStyle(theme)}
          >
            <Text style={{ color: theme.colors.textAlt }}>
              {moment(selectedMonth).add(1, 'month').format('MMM')}
            </Text>
            <LucideIcon
              icon={ArrowRightIcon}
              size={15}
              color={theme.colors.textAlt}
            />
          </Button>
        ) : (
          <View style={{ width: 72 }} />
        )}
      </View>

      <ScrollView
        automaticallyAdjustKeyboardInsets
        // Must flex — RN 0.86's Yoga no longer clamps an unflexed ScrollView
        // to its parent's bounds; without this it sizes to the report paper
        // and stops scrolling once the content exceeds the screen.
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingTop: 18,
          paddingBottom: insets.bottom + 130,
          paddingHorizontal: 16,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: PAPER_WIDTH + 40,
            minHeight: paperHeight + 40,
            alignItems: 'center',
          }}
        >
          {/* Sheet behind the main one */}
          <BackPaperSheet height={paperHeight} />
          {/* Main sheet */}
          <PaperSheet
            handwritingFont={handwritingFont}
            handwritingFontBold={handwritingFontBold}
            monthYearLabel={monthYearLabel}
            name={hasName ? name : null}
            sharedInMinistry={data.sharedInMinistry}
            studies={data.studies ?? 0}
            hours={data.hours}
            credit={data.credit}
            showHours={data.showHours}
            showCredit={data.showCredit}
            notes={data.notes}
            notesEditing={isEditingNotes}
            notesDraft={notesDraft}
            onChangeNotesDraft={setNotesDraft}
            notesAccessory={
              <View
                style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}
              >
                {isEditingNotes ? (
                  <IconButton
                    icon={CheckIcon}
                    size={14}
                    color={PAPER_LABEL}
                    hitSlop={8}
                    onPress={handleSaveNotes}
                    accessibilityLabel={i18n.t('save')}
                  />
                ) : (
                  <>
                    {data.hasNotesOverride && (
                      <IconButton
                        icon={RotateCcwIcon}
                        size={13}
                        color={PAPER_LABEL}
                        hitSlop={8}
                        onPress={handleResetNotes}
                        accessibilityLabel={i18n.t('reset')}
                      />
                    )}
                    <IconButton
                      icon={PencilIcon}
                      size={13}
                      color={PAPER_LABEL}
                      hitSlop={8}
                      onPress={handleStartEditNotes}
                      accessibilityLabel={i18n.t('edit')}
                    />
                  </>
                )}
              </View>
            }
            height={paperHeight}
            onLayoutContent={handlePaperLayout}
          />
        </View>
      </ScrollView>

      <View
        style={{
          position: 'absolute',
          left: 20,
          right: 20,
          bottom: insets.bottom + 12,
          gap: 6,
        }}
      >
        {submitDisabled && (
          <Text
            style={{
              color: theme.colors.textAlt,
              fontSize: theme.fontSize('sm'),
              textAlign: 'center',
            }}
          >
            {i18n.t('nwPublisherOnlyAllowsLastMonth')}
          </Text>
        )}
        <SplitButton
          onPress={handleSubmitCta}
          disabled={submitDisabled}
          actions={methodActions}
          menuTitle={i18n.t('defaultExportMethod')}
          selectedActionId={defaultExportMethod}
          menuAccessibilityLabel={i18n.t('changeSubmissionMethod')}
          onOpenMenu={handleMenuOpen}
          onSelectAction={(actionId) =>
            set({ defaultExportMethod: actionId as ReportExportMethod })
          }
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <LucideIcon
              icon={
                isSubmitConfirmed
                  ? CheckIcon
                  : exportMethodCtaIcons[defaultExportMethod]
              }
              size={15}
              style={{ color: theme.colors.textInverse }}
            />
            <Text
              style={{
                fontSize: theme.fontSize('lg'),
                color: theme.colors.textInverse,
                fontFamily: theme.fonts.bold,
              }}
            >
              {isSubmitConfirmed ? i18n.t('reportSubmitted') : submitCtaLabel}
            </Text>
            {submitIsExternal && !isSubmitConfirmed && (
              <LucideIcon
                icon={ExternalLinkIcon}
                size={11}
                style={{ color: theme.colors.textInverse }}
              />
            )}
          </View>
        </SplitButton>
      </View>
    </View>
  )
}

const monthNavButtonStyle = (theme: ReturnType<typeof useTheme>) => ({
  minWidth: 72,
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderWidth: 1,
  borderColor: theme.colors.border,
  borderRadius: theme.numbers.borderRadiusLg,
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  gap: 5,
})

type PaperSheetProps = {
  handwritingFont: string
  handwritingFontBold: string
  monthYearLabel: string
  name: string | null
  sharedInMinistry: boolean
  studies: number
  hours: number
  credit: number
  showHours: boolean
  showCredit: boolean
  notes: string
  notesEditing: boolean
  notesDraft: string
  onChangeNotesDraft: (text: string) => void
  notesAccessory: React.ReactNode
  height: number
  onLayoutContent: (e: LayoutChangeEvent) => void
}

const PaperSheet = ({
  handwritingFont,
  handwritingFontBold,
  monthYearLabel,
  name,
  sharedInMinistry,
  studies,
  hours,
  credit,
  showHours,
  showCredit,
  notes,
  notesEditing,
  notesDraft,
  onChangeNotesDraft,
  notesAccessory,
  height,
  onLayoutContent,
}: PaperSheetProps) => {
  return (
    <PaperSurface height={height} onLayoutContent={onLayoutContent}>
      <View style={{ alignItems: 'center', marginBottom: 18 }}>
        <Text
          style={{
            fontFamily: handwritingFontBold,
            fontSize: 28,
            color: PAPER_INK,
            lineHeight: 40,
            includeFontPadding: false,
          }}
        >
          {monthYearLabel}
        </Text>
        <View
          style={{
            height: 1,
            backgroundColor: PAPER_LINE,
            width: '70%',
            marginTop: 4,
            opacity: 0.6,
          }}
        />
        {name ? (
          <Text
            numberOfLines={1}
            adjustsFontSizeToFit
            style={{
              fontFamily: handwritingFont,
              fontSize: 18,
              color: PAPER_INK_SOFT,
              marginTop: 6,
              maxWidth: '100%',
              transform: [{ rotate: '-0.6deg' }],
            }}
          >
            {name}
          </Text>
        ) : null}
      </View>

      <PaperRow label={i18n.t('sharedInMinistry')}>
        <HandDrawnCheck checked={sharedInMinistry} />
      </PaperRow>

      <PaperRow label={i18n.t('bibleStudiesConducted')}>
        <HandwrittenValue
          value={studies}
          fontFamily={handwritingFontBold}
          seed={11}
        />
      </PaperRow>

      {showHours && (
        <PaperRow label={i18n.t('hours')}>
          <HandwrittenValue
            value={hours}
            fontFamily={handwritingFontBold}
            seed={23}
          />
        </PaperRow>
      )}

      {showCredit && (
        <PaperRow label={i18n.t('credit')}>
          <HandwrittenValue
            value={credit}
            fontFamily={handwritingFontBold}
            seed={37}
          />
        </PaperRow>
      )}

      <PaperRow label={i18n.t('comments')} extraGap accessory={notesAccessory}>
        {notesEditing ? (
          <TextArea
            unstyled
            value={notesDraft}
            onChangeText={onChangeNotesDraft}
            multiline
            autoFocus
            autoFocusNative
            scrollEnabled={false}
            style={{
              fontFamily: handwritingFont,
              fontSize: 15,
              color: PAPER_INK_SOFT,
              lineHeight: 21,
              minHeight: 48,
              paddingTop: 0,
              paddingBottom: 0,
            }}
          />
        ) : (
          <HandwrittenNote text={notes} fontFamily={handwritingFont} />
        )}
      </PaperRow>
    </PaperSurface>
  )
}

const HandwrittenNote = ({
  text,
  fontFamily,
}: {
  text: string
  fontFamily: string
}) => {
  if (!text) {
    return <View style={{ minHeight: 48 }} />
  }
  return (
    <Text
      style={{
        fontFamily,
        fontSize: 15,
        color: PAPER_INK_SOFT,
        lineHeight: 21,
        transform: [{ rotate: '-0.4deg' }],
      }}
    >
      {text}
    </Text>
  )
}

const HandDrawnCheck = ({ checked }: { checked: boolean }) => {
  return (
    <View
      style={{
        width: 44,
        height: 44,
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <Svg width={44} height={44} viewBox='0 0 44 44'>
        {/* Hand-drawn box outline */}
        <Path
          d='M 4 6 Q 3 18, 4.5 30 Q 4 36, 6 38 Q 18 38.5, 32 38 Q 34 38, 34 36 Q 34.5 22, 33.5 8 Q 34 5, 32 5 Q 18 4.5, 6 5 Q 4 5, 4 6 Z'
          fill='none'
          stroke={PAPER_INK}
          strokeWidth={1.6}
          strokeLinecap='round'
          strokeLinejoin='round'
        />
        {checked && (
          <Path
            d='M 9 22 Q 13 27, 17 31 Q 24 19, 36 6'
            fill='none'
            stroke={PAPER_INK}
            strokeWidth={2.6}
            strokeLinecap='round'
            strokeLinejoin='round'
          />
        )}
      </Svg>
    </View>
  )
}

export default ServiceReportViewScreen
