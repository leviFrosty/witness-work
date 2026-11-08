import {
  GroupedListPickerRow,
  GroupedListSection,
} from '@/components/ui/GroupedList'
import i18n, { TranslationKey } from '@/lib/locales'
import { compareText } from '@/lib/collation'
import { usePreferences } from '@/stores/preferences'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import moment from 'moment'
import {
  DateOrder,
  FORMAT_REGIONS,
  FormatRegion,
  TimeFormat,
  getPristineLongDateFormat,
  numericPatternForLanguage,
  resolveDateOrder,
  resolveStartOfWeek,
  resolveTimeFormat,
  localizeDisplayDate,
} from '@/lib/dates'

const DATE_ORDER_PATTERNS: Record<DateOrder, string> = {
  mdy: 'MM/DD/YYYY',
  dmy: 'DD/MM/YYYY',
  ymd: 'YYYY/MM/DD',
}

const AUTO = 'auto'

const toOptions = <T extends string | number>(
  options: { label: string; value: T | undefined }[]
) =>
  options.map(({ label, value }) => ({
    label,
    value: value === undefined ? AUTO : String(value),
  }))

const fromOption = (value: string) => (value === AUTO ? undefined : value)

const AppearancePreferencesSection = () => {
  const {
    set,
    timeDisplayFormat,
    startOfWeek,
    formatRegion,
    timeFormat,
    dateOrder,
  } = usePreferences()

  const autoStartOfWeek = resolveStartOfWeek({ region: formatRegion })
  const autoTimeFormat = resolveTimeFormat({ region: formatRegion })
  const autoDateOrder = resolveDateOrder({ region: formatRegion })

  const now = moment()

  const regionSample = (key: FormatRegion): string => {
    const datePattern = getPristineLongDateFormat(key, 'L')
    const timePattern = getPristineLongDateFormat(key, 'LT')
    if (!datePattern || !timePattern) return ''
    return localizeDisplayDate(
      `${now.format(numericPatternForLanguage(datePattern))} ${now.format(timePattern)}`
    )
  }

  const regionOptions: { label: string; value: FormatRegion | undefined }[] = [
    { label: i18n.t('autoDevice'), value: undefined },
    ...FORMAT_REGIONS.map((key) => ({
      label: `${i18n.t(`formatRegions.${key}` as TranslationKey)} · ${regionSample(key)}`,
      value: key,
    })).sort((a, b) => compareText(a.label, b.label)),
  ]

  const weekdayNames = moment.weekdays()
  const startOfWeekOptions: { label: string; value: number | undefined }[] = [
    {
      label: i18n.t('autoWithValue', { value: weekdayNames[autoStartOfWeek] }),
      value: undefined,
    },
    ...weekdayNames.map((label, value) => ({ label, value })),
  ]

  const timeSample = (format: TimeFormat) =>
    localizeDisplayDate(
      now
        .clone()
        .hour(13)
        .minute(30)
        .format(format === '12' ? 'h:mm A' : 'HH:mm')
    )
  const timeFormatOptions: { label: string; value: TimeFormat | undefined }[] =
    [
      {
        label: i18n.t('autoWithValue', { value: timeSample(autoTimeFormat) }),
        value: undefined,
      },
      { label: timeSample('12'), value: '12' },
      { label: timeSample('24'), value: '24' },
    ]

  const orderSample = (order: DateOrder) =>
    localizeDisplayDate(now.format(DATE_ORDER_PATTERNS[order]))
  const dateOrderOptions: { label: string; value: DateOrder | undefined }[] = [
    {
      label: i18n.t('autoWithValue', { value: orderSample(autoDateOrder) }),
      value: undefined,
    },
    { label: orderSample('mdy'), value: 'mdy' },
    { label: orderSample('dmy'), value: 'dmy' },
    { label: orderSample('ymd'), value: 'ymd' },
  ]

  const timeDisplayOptions: { label: string; value: MinuteDisplayFormat }[] = [
    { label: i18n.t('decimalExample'), value: 'decimal' },
    { label: i18n.t('shortExample'), value: 'short' },
  ]

  return (
    <>
      <GroupedListSection>
        <GroupedListPickerRow
          label={i18n.t('durationFormat')}
          options={timeDisplayOptions}
          value={timeDisplayFormat}
          onChange={(value) =>
            set({ timeDisplayFormat: value as MinuteDisplayFormat })
          }
        />
      </GroupedListSection>
      <GroupedListSection
        title={i18n.t('dateAndTime')}
        footer={i18n.t('formatRegion_description')}
      >
        <GroupedListPickerRow
          label={i18n.t('formatRegion')}
          options={toOptions(regionOptions)}
          value={formatRegion ?? AUTO}
          onChange={(value) =>
            set({ formatRegion: fromOption(value) as FormatRegion | undefined })
          }
        />
        <GroupedListPickerRow
          label={i18n.t('startOfWeek')}
          options={toOptions(startOfWeekOptions)}
          value={startOfWeek === undefined ? AUTO : String(startOfWeek)}
          onChange={(value) => {
            const day = fromOption(value)
            set({ startOfWeek: day === undefined ? undefined : Number(day) })
          }}
        />
        <GroupedListPickerRow
          label={i18n.t('clockFormat')}
          options={toOptions(timeFormatOptions)}
          value={timeFormat ?? AUTO}
          onChange={(value) =>
            set({ timeFormat: fromOption(value) as TimeFormat | undefined })
          }
        />
        <GroupedListPickerRow
          label={i18n.t('dateOrder')}
          options={toOptions(dateOrderOptions)}
          value={dateOrder ?? AUTO}
          onChange={(value) =>
            set({ dateOrder: fromOption(value) as DateOrder | undefined })
          }
        />
      </GroupedListSection>
    </>
  )
}

export default AppearancePreferencesSection
