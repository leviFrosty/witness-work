import { View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import i18n, { TranslationKey } from '@/lib/locales'
import Select from '@/components/ui/Select'
import { usePreferences } from '@/stores/preferences'
import Text from '@/components/ui/MyText'
import { useContext } from 'react'
import { ThemeContext } from '@/contexts/theme'
import { MinuteDisplayFormat } from '@/types/timeEntry'
import moment from 'moment'
import {
  DateOrder,
  FORMAT_REGIONS,
  FormatRegion,
  TimeFormat,
  getPristineLongDateFormat,
  resolveDateOrder,
  resolveStartOfWeek,
  resolveTimeFormat,
} from '@/lib/dates'

// Canonical numeric patterns for the Date Order samples — the row is about
// ordering, not the Region's separator flavor.
const DATE_ORDER_PATTERNS: Record<DateOrder, string> = {
  mdy: 'MM/DD/YYYY',
  dmy: 'DD/MM/YYYY',
  ymd: 'YYYY/MM/DD',
}

const AppearancePreferencesSection = () => {
  const {
    set,
    fontSizeOffset,
    colorScheme,
    timeDisplayFormat,
    startOfWeek,
    formatRegion,
    timeFormat,
    dateOrder,
  } = usePreferences()
  const theme = useContext(ThemeContext)
  const fontSizeOffsetOptions = [
    { label: '-1', value: -1 },
    { label: '0', value: 0 },
    { label: '+1', value: 1 },
    { label: '+2', value: 2 },
    { label: '+3', value: 3 },
    { label: '+4', value: 4 },
  ]

  const darkModeOptions: {
    label: string
    value: 'light' | 'dark' | undefined
  }[] = [
    { label: i18n.t('device'), value: undefined },
    { label: i18n.t('dark'), value: 'dark' },
    { label: i18n.t('light'), value: 'light' },
  ]

  // What each Auto row currently resolves to (Region → device), so the Auto
  // option can show its effective value.
  const autoStartOfWeek = resolveStartOfWeek({ region: formatRegion })
  const autoTimeFormat = resolveTimeFormat({ region: formatRegion })
  const autoDateOrder = resolveDateOrder({ region: formatRegion })

  const now = moment()

  // Live per-region sample built from the region's PRISTINE patterns — the
  // active language locale carries the Region overlay, so reading its
  // longDateFormat directly would show the patched values for that key.
  const regionSample = (key: FormatRegion): string => {
    const datePattern = getPristineLongDateFormat(key, 'L')
    const timePattern = getPristineLongDateFormat(key, 'LT')
    if (!datePattern || !timePattern) return ''
    return `${now.format(datePattern)} ${now.format(timePattern)}`
  }

  const regionOptions: { label: string; value: FormatRegion | undefined }[] = [
    { label: `${i18n.t('auto')} (${i18n.t('device')})`, value: undefined },
    ...FORMAT_REGIONS.map((key) => ({
      label: `${i18n.t(`formatRegions.${key}` as TranslationKey)} · ${regionSample(key)}`,
      value: key,
    })).sort((a, b) => a.label.localeCompare(b.label)),
  ]

  // moment.weekdays() is locale-translated but always Sunday-first indexed,
  // matching the stored 0–6 values.
  const weekdayNames = moment.weekdays()
  const startOfWeekOptions: { label: string; value: number | undefined }[] = [
    {
      label: `${i18n.t('auto')} (${weekdayNames[autoStartOfWeek]})`,
      value: undefined,
    },
    ...weekdayNames.map((label, value) => ({ label, value })),
  ]

  const timeSample = (format: TimeFormat) =>
    now
      .clone()
      .hour(13)
      .minute(30)
      .format(format === '12' ? 'h:mm A' : 'HH:mm')
  const timeFormatOptions: { label: string; value: TimeFormat | undefined }[] =
    [
      {
        label: `${i18n.t('auto')} (${timeSample(autoTimeFormat)})`,
        value: undefined,
      },
      { label: timeSample('12'), value: '12' },
      { label: timeSample('24'), value: '24' },
    ]

  const orderSample = (order: DateOrder) =>
    now.format(DATE_ORDER_PATTERNS[order])
  const dateOrderOptions: { label: string; value: DateOrder | undefined }[] = [
    {
      label: `${i18n.t('auto')} (${orderSample(autoDateOrder)})`,
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
    <View style={{ gap: 20 }}>
      <Section>
        <InputRowContainer
          label={i18n.t('colorScheme')}
          style={{ justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1 }}>
            <Select
              data={darkModeOptions}
              value={colorScheme}
              onChange={({ value }) => set({ colorScheme: value })}
            />
          </View>
        </InputRowContainer>
        <InputRowContainer
          label={i18n.t('durationFormat')}
          style={{ justifyContent: 'space-between' }}
        >
          <View style={{ flex: 1 }}>
            <Select
              data={timeDisplayOptions}
              value={timeDisplayFormat}
              onChange={({ value }) => set({ timeDisplayFormat: value })}
            />
          </View>
        </InputRowContainer>
        <InputRowContainer
          label={i18n.t('fontSizeOffset')}
          style={{ justifyContent: 'space-between' }}
          lastInSection
        >
          <View style={{ flex: 1 }}>
            <Select
              data={fontSizeOffsetOptions}
              value={fontSizeOffset}
              onChange={({ value }) => set({ fontSizeOffset: value })}
            />
          </View>
        </InputRowContainer>
        <Text
          style={{
            fontSize: theme.fontSize('sm'),
            color: theme.colors.textAlt,
          }}
        >
          {i18n.t('thisGloballyOffsetsTextSize')}
        </Text>
      </Section>
      <View style={{ gap: 5 }}>
        <SectionTitle text={i18n.t('dateAndTime')} />
        <Section>
          <InputRowContainer
            label={i18n.t('formatRegion')}
            style={{ justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1 }}>
              <Select
                data={regionOptions}
                value={formatRegion}
                onChange={({ value }) => set({ formatRegion: value })}
              />
            </View>
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('startOfWeek')}
            style={{ justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1 }}>
              <Select
                data={startOfWeekOptions}
                value={startOfWeek}
                onChange={({ value }) => set({ startOfWeek: value })}
              />
            </View>
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('clockFormat')}
            style={{ justifyContent: 'space-between' }}
          >
            <View style={{ flex: 1 }}>
              <Select
                data={timeFormatOptions}
                value={timeFormat}
                onChange={({ value }) => set({ timeFormat: value })}
              />
            </View>
          </InputRowContainer>
          <InputRowContainer
            label={i18n.t('dateOrder')}
            style={{ justifyContent: 'space-between' }}
            lastInSection
          >
            <View style={{ flex: 1 }}>
              <Select
                data={dateOrderOptions}
                value={dateOrder}
                onChange={({ value }) => set({ dateOrder: value })}
              />
            </View>
          </InputRowContainer>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('formatRegion_description')}
          </Text>
        </Section>
      </View>
    </View>
  )
}

export default AppearancePreferencesSection
