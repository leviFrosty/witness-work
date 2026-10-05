import { analytics } from '@/lib/analytics'
import {
  ArrowLeftRight as ArrowLeftRightIcon,
  Construction as ConstructionIcon,
} from 'lucide-react-native'
import { Swipeable } from 'react-native-gesture-handler'
import useTheme from '@/contexts/theme'
import Haptics from '@/lib/haptics'
import { TimeEntry } from '@/types/timeEntry'
import SwipeableDelete from '@/components/ui/swipeableActions/Delete'
import { Alert, View } from 'react-native'
import i18n, { type TranslationKey } from '@/lib/locales'
import useServiceReport from '@/stores/serviceReport'
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
import { useToastController } from '@tamagui/toast'
import * as Clipboard from 'expo-clipboard'
import CreditBadge from '@/features/service-reports/components/CreditBadge'
import { RootStackNavigation } from '@/types/rootStack'
import { formatMinutes, useFormattedMinutes } from '@/lib/minutes'
import { useCardStyle } from '@/components/ui/Card'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import { LDC_BUILTIN_CATEGORY_ID } from '@/constants/categories'
import type { Category } from '@/types/category'

interface TimeReportRowProps {
  report: TimeEntry
  onPress?: () => void
  /**
   * Runs a navigation from the row's menu. Hosts that present the row in a
   * modal sheet pass one that closes the sheet first.
   */
  onNavigate?: (navigate: () => void) => void
}

const TimeReportRow = ({ report, onPress, onNavigate }: TimeReportRowProps) => {
  const theme = useTheme()
  const cardStyle = useCardStyle()
  const { deleteServiceReport, deleteRolloverPair, updateServiceReport } =
    useServiceReport()
  const { categories } = useCategories()
  const timeDisplayFormat = usePreferences((s) => s.timeDisplayFormat)
  const navigation = useNavigation<RootStackNavigation>()
  const toast = useToastController()
  const categoryLabel = getCategoryLabel(report, categories)
  const isLdc = isLdcEntry(report)

  const totalMinutes = report.hours * 60 + report.minutes
  const formattedTime = useFormattedMinutes(Math.abs(totalMinutes))
  const isRollover = report.rollover === true
  const sign = totalMinutes < 0 ? '−' : '+'
  const dateLabel = formatDate(momentStoredDate(report.date))

  const go = (navigate: () => void) =>
    onNavigate ? onNavigate(navigate) : navigate()

  /**
   * The one delete flow for this row — the context menu and the right-swipe
   * both land here, so the rollover-pair warning can't be reachable from only
   * one of them.
   */
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
          analytics.capture('time_entry_deleted', { source: 'time_report_row' })
        }
        toast.show(i18n.t('success'), {
          message: i18n.t('deleted'),
          native: true,
        })
      },
    })
  }

  const handleSwipeOpen = (
    direction: 'left' | 'right',
    swipeable: Swipeable
  ) => {
    if (direction !== 'right') return

    // Snap the row back before the confirmation lands — the alert owns the
    // interaction from here, whichever way the user answers it.
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
    // Rollover entries are paired and must never be edited — would imbalance
    // the source/destination math. Block here regardless of whether a caller
    // passed a custom onPress (their intent is also edit-routing).
    // Centralizing the rule here means new call sites can't accidentally
    // bypass it.
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
    const text = [`${dateLabel} · ${duration}`, report.note]
      .filter(Boolean)
      .join('\n')
    Haptics.success().catch(() => {})
    await Clipboard.setStringAsync(text)
    toast.show(i18n.t('copied'), { native: true, duration: 2000 })
  }

  /** Re-types the entry in place, as the Add Time screen's Type row would. */
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
      has_category: !!category,
      has_note: !!report.note,
    })
  }

  // Standard, LDC, then the user's Categories — the Type picker's order —
  // minus the one the entry already has.
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
      // Rollover entries are paired and must never be edited — see the press
      // handler above.
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
    <Swipeable
      key={report.id}
      onSwipeableWillOpen={() => Haptics.light()}
      containerStyle={{
        backgroundColor: theme.colors.background,
        borderRadius: cardStyle.borderRadius,
      }}
      renderRightActions={() => (
        <SwipeableDelete size='xs' style={{ flexDirection: 'row' }} />
      )}
      onSwipeableOpen={(direction, swipeable) =>
        handleSwipeOpen(direction, swipeable)
      }
    >
      <ContextMenu
        actions={actions}
        onPress={handlePress}
        hoverRadius={cardStyle.borderRadius}
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
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexGrow: 1,
              gap: 10,
            }}
          >
            <View
              style={{
                flex: 1,
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
                numberOfLines={1}
                ellipsizeMode='tail'
              >
                {dateLabel}
              </Text>
            </View>
            <Text
              style={{
                color: theme.colors.textAlt,
                fontSize: theme.fontSize('sm'),
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
          {!isRollover && (isLdc || categoryLabel || report.note) && (
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
              {report.note && (
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    fontSize: theme.fontSize('sm'),
                    lineHeight: 18,
                  }}
                >
                  {report.note}
                </Text>
              )}
            </View>
          )}
        </View>
      </ContextMenu>
    </Swipeable>
  )
}

export default TimeReportRow
