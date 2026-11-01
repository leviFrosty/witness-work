import { analytics } from '@/lib/analytics'
import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Construction as ConstructionIcon,
} from 'lucide-react-native'
import SwipeableRow, {
  type Swipeable,
  type SwipeSide,
} from '@/components/ui/SwipeableRow'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { TimeEntry } from '@/types/timeEntry'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import { Alert, View } from 'react-native'
import i18n, { type TranslationKey } from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'
import { timeEntryMode } from '@/lib/serviceReport'
import Text from '@/components/ui/MyText'
import { formatDate } from '@/lib/dates'
import { momentStoredDate, storedDateToLocalDate } from '@/lib/normalizeDate'
import IconButton from '@/components/ui/IconButton'
import ContextMenu, {
  type ContextMenuAction,
  type ContextMenuEntries,
} from '@/components/ui/ContextMenu'
import confirmDestructive from '@/lib/confirmDestructive'
import { useNavigation } from '@react-navigation/native'
import { toast } from '@/stores/toasts'
import * as Clipboard from 'expo-clipboard'
import CreditBadge from '@/features/service-reports/components/CreditBadge'
import { RootStackNavigation } from '@/types/rootStack'
import { formatMinutes, useFormattedMinutes } from '@/lib/minutes'
import { entryMinutes } from '@/lib/entryMinutes'
import { useCardStyle } from '@/components/ui/Card'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { Category } from '@/types/category'
import RichNote from '@/components/RichNote'
import { getNoteText, hasNote } from '@/lib/richText/notes'

interface TimeReportRowProps {
  report: TimeEntry
  onPress?: () => void

  onNavigate?: (navigate: () => void) => void
}

const TimeReportRow = ({ report, onPress, onNavigate }: TimeReportRowProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const largeText = useAccessibilityTextSize()
  const { deleteServiceReport, deleteRolloverPair, updateServiceReport } =
    useServiceReport()
  const showsNote = hasNote(report)
  const { categories } = useCategories()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const navigation = useNavigation<RootStackNavigation>()
  const categoryLabel = getCategoryLabel(report, categories)
  const isLdc = isLdcEntry(report)

  const totalMinutes = entryMinutes(report)
  const formattedTime = useFormattedMinutes(Math.abs(totalMinutes))
  const isRollover = report.rollover === true
  const sign = totalMinutes < 0 ? '−' : '+'
  const dateLabel = formatDate(momentStoredDate(report.date))

  const go = (navigate: () => void) =>
    onNavigate ? onNavigate(navigate) : navigate()

  const handleRequestDelete = () => {
    const isRolloverPair =
      report.rollover === true && report.rolloverGroupId !== undefined

    confirmDestructive({
      title: isRolloverPair
        ? i18n.t('timeRollover_deletePair_title')
        : i18n.t('deleteTime_title'),
      description: isRolloverPair
        ? i18n.t('timeRollover_deletePair_description')
        : i18n.t('deleteTime_description'),
      onConfirm: () => {
        if (isRolloverPair) {
          deleteRolloverPair(report)
          analytics.capture('time_rollover_undone')
        } else {
          deleteServiceReport(report)
          analytics.capture('time_entry_deleted', {
            source: 'time_report_row',
            entry_mode: timeEntryMode(report),
          })
        }
        toast.success(i18n.t('success'), {
          message: i18n.t('deleted'),
        })
      },
    })
  }

  const handleSwipeOpen = (side: SwipeSide, swipeable: Swipeable) => {
    if (side !== 'trailing') return

    swipeable.reset()
    handleRequestDelete()
  }

  const handleEdit = () => {
    if (onPress) {
      onPress()
      return
    }
    navigation.navigate('Add Time', {
      existingReport: JSON.stringify(report),
    })
  }

  const handlePress = () => {
    if (isRollover) {
      Alert.alert(
        i18n.t('timeRollover_cantEdit_title'),
        i18n.t('timeRollover_cantEdit_description')
      )
      return
    }
    handleEdit()
  }

  const logAgainToday = () =>
    go(() =>
      navigation.navigate('Add Time', {
        date: new Date().toISOString(),
        hours: report.hours,
        minutes: report.minutes,
        categoryId: report.categoryId,
      })
    )

  const copy = async () => {
    const duration = formatMinutes(totalMinutes, timeDisplayFormat).formatted
    const text = [`${dateLabel} · ${duration}`, getNoteText(report)]
      .filter(Boolean)
      .join('\n')
    Haptics.success().catch(() => {})
    await Clipboard.setStringAsync(text)
    toast.success(i18n.t('copied'), { durationMs: 2000 })
  }

  const changeCategory = (category: Category | null) => {
    updateServiceReport({
      ...report,
      date: storedDateToLocalDate(report.date),
      categoryId: category?.id,
      tag: undefined,
      credit: category?.isCredit ?? false,
    })
    analytics.capture('time_entry_updated', {
      source: 'time_report_row_menu',
      entry_mode: timeEntryMode(report),
      has_category: !!category,
      has_note: !!report.note,
    })
  }

  const ldc = categories.find((c) => c.id === LDC_BUILTIN_CATEGORY_ID)
  const categoryChoices: ContextMenuAction[] = [
    !!report.categoryId && {
      id: 'standard',
      title: i18n.t('standard'),
      onPress: () => changeCategory(null),
    },
    ldc &&
      !isLdc && {
        id: 'ldc',
        title: i18n.t('ldc'),
        onPress: () => changeCategory(ldc),
      },
    ...categories
      .filter(
        (c) => c.id !== LDC_BUILTIN_CATEGORY_ID && c.id !== report.categoryId
      )
      .map((c, index) => ({
        id: `category_${index}`,
        title: i18n.t(c.name as TranslationKey, { defaultValue: c.name }),
        onPress: () => changeCategory(c),
      })),
  ].filter((choice): choice is ContextMenuAction => !!choice)

  const actions: ContextMenuEntries = [
    [
      !isRollover && {
        id: 'edit',
        title: i18n.t('edit'),
        systemImage: 'pencil',
        onPress: handleEdit,
      },
      !isRollover && {
        id: 'log_again_today',
        title: i18n.t('logAgainToday'),
        systemImage: 'clock.arrow.circlepath',
        onPress: logAgainToday,
      },
      {
        id: 'copy',
        title: i18n.t('copy'),
        systemImage: 'doc.on.doc',
        onPress: () => void copy(),
      },
    ],
    [
      !isRollover && {
        id: 'change_category',
        title: i18n.t('changeCategory'),
        systemImage: 'tag',
        actions: categoryChoices,
      },
    ],
    [
      {
        id: 'delete',
        title: i18n.t('delete'),
        systemImage: 'trash',
        destructive: true,
        onPress: handleRequestDelete,
      },
    ],
  ]

  return (
    <SwipeableRow
      key={report.id}
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderTrailingActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(side, swipeable) => handleSwipeOpen(side, swipeable)}
    >
      <ContextMenu
        actions={actions}
        onPress={handlePress}
        hoverRadius={cardStyle.borderRadius}
        testID={isRollover ? 'rollover-row' : undefined}
      >
        <View
          style={
            isRollover
              ? {
                  backgroundColor: theme.colors.backgroundLighter,
                  paddingVertical: 12,
                  paddingHorizontal: 15,
                  borderRadius: cardStyle.borderRadius,
                  borderWidth: 1,
                  borderStyle: 'dashed',
                  borderColor: theme.colors.border,
                  gap: 10,
                }
              : {
                  ...cardStyle,
                  paddingVertical: 12,
                  paddingHorizontal: 15,
                  gap: 10,
                }
          }
        >
          {}
          <View
            style={{
              flexDirection: largeText ? 'column' : 'row',
              justifyContent: 'space-between',
              alignItems: largeText ? 'stretch' : 'center',
              flexGrow: 1,
              gap: largeText ? 4 : 10,
            }}
          >
            <View
              style={{
                flex: largeText ? undefined : 1,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: isRollover ? theme.colors.textAlt : theme.colors.text,
                  flexShrink: 1,
                }}
                numberOfLines={largeText ? undefined : 1}
                ellipsizeMode='tail'
              >
                {dateLabel}
              </Text>
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
                alignSelf: largeText ? 'flex-end' : undefined,
              }}
              numberOfLines={1}
            >
              {isRollover
                ? `${sign} ${formattedTime.formatted}`
                : formattedTime.formatted}
            </Text>
          </View>
          {isRollover && (
            <View
              style={{
                flexDirection: 'row',
                gap: 6,
                alignItems: 'center',
              }}
            >
              <IconButton icon={ArrowLeftRightIcon} />
              <Text
                style={{
                  color: theme.colors.textAlt,
                  fontSize: theme.fontSize('sm'),
                }}
              >
                {i18n.t('timeRollover_rowLabel')}
              </Text>
            </View>
          )}
          {!isRollover && (isLdc || categoryLabel || showsNote) && (
            <View style={{ gap: 5 }}>
              {(isLdc || categoryLabel) && (
                <View
                  style={{
                    flexDirection: 'row',
                    gap: 5,
                    alignItems: 'center',
                  }}
                >
                  {isLdc && <IconButton icon={ConstructionIcon} />}
                  <Text
                    style={{
                      color: theme.colors.textAlt,
                      fontSize: theme.fontSize('sm'),
                    }}
                  >
                    {isLdc ? i18n.t('ldc') : categoryLabel}
                  </Text>
                  {(report.credit || isLdc) && <CreditBadge />}
                </View>
              )}
              {showsNote && (
                <RichNote
                  note={report}
                  nested
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    lineHeight: 18,
                  }}
                  onChange={(fields) =>
                    updateServiceReport({
                      ...report,
                      date: storedDateToLocalDate(report.date),
                      ...fields,
                    })
                  }
                />
              )}
            </View>
          )}
        </View>
      </ContextMenu>
    </SwipeableRow>
  )
}

export default TimeReportRow
