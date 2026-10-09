import moment from 'moment'
import { useState } from 'react'
import { ChevronRight as ChevronRightIcon } from 'lucide-react-native'

import { View } from 'react-native'
import ContextMenu from '@/components/ui/ContextMenu'
import confirmDestructive from '@/lib/confirmDestructive'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'

import i18n from '@/lib/locales'
import { AUXILIARY_REDUCED_GOAL_HOURS } from '@/lib/monthStatus'
import { usePreferences } from '@/stores/preferences'
import usePublisher from '@/hooks/usePublisher'
import AuxiliaryMonthSheet from '@/features/service-reports/components/AuxiliaryMonthSheet'
import useAuxiliaryMonths, {
  type AuxiliaryMonthSource,
} from '@/features/service-reports/hooks/useAuxiliaryMonths'

/**
 * Entry point for a Kingdom Publisher's one-month auxiliary pioneering. Renders
 * only when the standing role reports by checkbox; everyone else changes a
 * month's status from the Progress tab.
 */
const AuxiliaryMonthRow = ({
  source,
  variant = 'inline',
  statusOnly = false,
}: {
  source: AuxiliaryMonthSource
  /** `inline` sits in a card (Home); `row` fills a settings Section. */
  variant?: 'inline' | 'row'
  /**
   * Only show an active or scheduled month. On Home the question itself lives
   * in the notifications tray.
   */
  statusOnly?: boolean
}) => {
  const theme = useTheme()
  const { entryMode } = usePublisher('standing')
  const publisherHours = usePreferences((s) => s.publisherHours)
  const { months, setAuxiliary } = useAuxiliaryMonths()
  const [open, setOpen] = useState(false)
  if (entryMode !== 'checkbox') return null

  const [thisMonth, nextMonth] = months
  const goalHours = (status: string) =>
    status === 'regularAuxiliaryReduced'
      ? AUXILIARY_REDUCED_GOAL_HOURS
      : publisherHours.regularAuxiliary

  const state = thisMonth.isAuxiliary
    ? 'this_month'
    : nextMonth.isAuxiliary
      ? 'next_month'
      : 'none'
  const label =
    state === 'this_month'
      ? i18n.t('auxiliaryMonth.activeThisMonth', {
          count: goalHours(thisMonth.status),
        })
      : state === 'next_month'
        ? i18n.t('auxiliaryMonth.scheduled', {
            month: moment(nextMonth.target).format('MMMM'),
          })
        : i18n.t('auxiliaryMonth.prompt')
  const active = state !== 'none'
  const activeMonth = thisMonth.isAuxiliary ? thisMonth : nextMonth

  const openSheet = () => {
    setOpen(true)
  }

  // Same as the sheet's "Not auxiliary pioneering in …" link, confirmed
  // because the menu skips the sheet.
  const confirmEnd = () => {
    const month = moment(activeMonth.target).format('MMMM')
    confirmDestructive({
      title: i18n.t('endAuxiliary_title', { month }),
      description: i18n.t('endAuxiliary_description', { month }),
      confirmLabel: i18n.t('endAuxiliary_confirm'),
      onConfirm: () => setAuxiliary(activeMonth, null, source),
    })
  }

  if (statusOnly && !active) return null

  return (
    <>
      <ContextMenu
        accessibilityLabel={label}
        onPress={openSheet}
        hoverRadius={
          variant === 'row' ? undefined : theme.numbers.borderRadiusMd
        }
        actions={[
          {
            id: 'edit',
            title: i18n.t('editEllipsis'),
            systemImage: 'pencil',
            onPress: openSheet,
          },
          active && {
            id: 'end_auxiliary',
            title: i18n.t('endAuxiliaryEllipsis'),
            systemImage: 'xmark.circle',
            destructive: true,
            onPress: confirmEnd,
          },
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
            minHeight: 44,
            ...(variant === 'row'
              ? { paddingHorizontal: 20, paddingVertical: 12 }
              : {
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderWidth: 1,
                  borderColor: active
                    ? theme.colors.accent
                    : theme.colors.border,
                  borderRadius: theme.numbers.borderRadiusMd,
                  backgroundColor: active
                    ? theme.colors.accentTranslucent
                    : 'transparent',
                }),
          }}
        >
          <Text
            style={{
              flex: 1,
              color: active ? theme.colors.accent : theme.colors.text,
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize(variant === 'row' ? 'md' : 'sm'),
            }}
          >
            {label}
          </Text>
          <LucideIcon
            icon={ChevronRightIcon}
            size={16}
            color={active ? theme.colors.accent : theme.colors.textAlt}
          />
        </View>
      </ContextMenu>
      <AuxiliaryMonthSheet open={open} onOpenChange={setOpen} source={source} />
    </>
  )
}

export default AuxiliaryMonthRow
