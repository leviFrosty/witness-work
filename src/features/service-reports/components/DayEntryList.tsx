import { useState } from 'react'
import { View } from 'react-native'
import { Pencil as PencilIcon, X as XIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import ContextMenu from '@/components/ui/ContextMenu'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import confirmDestructive from '@/lib/confirmDestructive'
import { entryMinutes } from '@/lib/entryMinutes'
import i18n, { type TranslationKey } from '@/lib/locales'
import { formatMinutes } from '@/lib/minutes'
import { localDayKey } from '@/lib/normalizeDate'
import { getNoteText } from '@/lib/richText/notes'
import { timeEntryMode } from '@/lib/serviceReport'
import { getCategoryLabel, isLdcEntry } from '@/lib/serviceReportCategory'
import useCategories from '@/stores/categories'
import { usePreferences } from '@/stores/preferences'
import useServiceReport from '@/stores/serviceReport'
import { toast } from '@/stores/toasts'
import type { TimeEntry } from '@/types/timeEntry'
import useReadableAccent from '@/features/service-reports/hooks/useReadableAccent'
import { entriesOnDay } from '@/features/service-reports/lib/entryDays'

const MAX_ROWS = 3

const DayEntryList = (props: {
  date: Date
  editing?: TimeEntry
  onSelect: (entry: TimeEntry) => void
  onDeleted: (entry: TimeEntry) => void
}) => {
  const theme = useTheme()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const deleteServiceReport = useServiceReport((s) => s.deleteServiceReport)
  const { categories } = useCategories()
  const format = usePreferences((s) => s.timeDisplayFormat)
  const durationColor = useReadableAccent()
  const [expandedDay, setExpandedDay] = useState<string>()

  const day = localDayKey(props.date)
  const logged = entriesOnDay(serviceReports, props.date)
  const { editing } = props
  const entries =
    editing && !logged.some((entry) => entry.id === editing.id)
      ? [...logged, editing]
      : logged
  if (!entries.length) return null

  const folded = entries.length > MAX_ROWS && expandedDay !== day
  const visible = folded
    ? entries.filter(
        (entry, index) => index < MAX_ROWS - 1 || entry.id === editing?.id
      )
    : entries
  const hidden = entries.length - visible.length

  const requestDelete = (entry: TimeEntry) =>
    confirmDestructive({
      title: i18n.t('deleteTime_title'),
      description: i18n.t('deleteTime_description'),
      onConfirm: () => {
        deleteServiceReport(entry)
        analytics.capture('time_entry_deleted', {
          source: 'add_time_day_entry',
          entry_mode: timeEntryMode(entry),
        })
        toast.success(i18n.t('success'), { message: i18n.t('deleted') })
        props.onDeleted(entry)
      },
    })

  return (
    <View style={{ marginTop: 8 }}>
      {visible.map((entry) => {
        const selected = entry.id === editing?.id
        const duration = formatMinutes(entryMinutes(entry), format).formatted
        const category = getCategoryLabel(entry, categories)
        const type = isLdcEntry(entry)
          ? i18n.t('ldc')
          : category
            ? i18n.t(category as TranslationKey, { defaultValue: category })
            : i18n.t('standard')
        const note = getNoteText(entry)?.trim().split('\n')[0]
        const detail = [type, note].filter(Boolean).join(' · ')
        return (
          <ContextMenu
            key={entry.id}
            actions={[
              [
                !selected && {
                  id: 'edit',
                  title: i18n.t('edit'),
                  systemImage: 'pencil',
                  onPress: () => props.onSelect(entry),
                },
              ],
              [
                {
                  id: 'delete',
                  title: i18n.t('delete'),
                  systemImage: 'trash',
                  destructive: true,
                  onPress: () => requestDelete(entry),
                },
              ],
            ]}
            onPress={() => props.onSelect(entry)}
            accessibilityLabel={`${duration}, ${detail}`}
            accessibilityState={{ selected }}
            hoverRadius={theme.numbers.borderRadiusMd}
            testID={`time-entry-day-entry-${entry.id}`}
          >
            <View
              style={{
                minHeight: MIN_TOUCH_TARGET,
                paddingHorizontal: 12,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                borderRadius: theme.numbers.borderRadiusMd,
                backgroundColor: selected ? theme.colors.card : 'transparent',
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  fontSize: theme.fontSize('sm'),
                  color: durationColor,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {duration}
              </Text>
              <Text
                numberOfLines={1}
                style={{
                  flex: 1,
                  fontSize: theme.fontSize('sm'),
                  color: selected ? theme.colors.text : theme.colors.textAlt,
                }}
              >
                {detail}
              </Text>
              <LucideIcon
                icon={selected ? XIcon : PencilIcon}
                size={16}
                color={selected ? theme.colors.text : theme.colors.textAlt}
              />
            </View>
          </ContextMenu>
        )
      })}
      {hidden > 0 && (
        <Button
          noTransform
          onPress={() => setExpandedDay(day)}
          accessibilityRole='button'
          testID='time-entry-day-entries-more'
          style={{
            minHeight: MIN_TOUCH_TARGET,
            paddingHorizontal: 12,
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontFamily: theme.fonts.medium,
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('timeForm_moreEntries', { count: hidden })}
          </Text>
        </Button>
      )}
    </View>
  )
}

export default DayEntryList
