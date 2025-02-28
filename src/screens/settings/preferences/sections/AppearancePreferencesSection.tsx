import { ColorSchemeName, View } from 'react-native'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import i18n from '../../../../lib/locales'
import Select from '../../../../components/Select'
import { usePreferences } from '../../../../stores/preferences'
import Text from '../../../../components/MyText'
import { useContext } from 'react'
import { ThemeContext } from '../../../../contexts/theme'
import { MinuteDisplayFormat } from '../../../../types/serviceReport'
import MapKey from '../../../../components/MapColorKey'
import Divider from '../../../../components/Divider'

const AppearancePreferencesSection = () => {
  const { set, fontSizeOffset, colorScheme, timeDisplayFormat, startOfWeek } =
    usePreferences()
  const theme = useContext(ThemeContext)
  const fontSizeOffsetOptions = [
    { label: '-1', value: -1 },
    { label: '0', value: 0 },
    { label: '+1', value: 1 },
    { label: '+2', value: 2 },
    { label: '+3', value: 3 },
    { label: '+4', value: 4 },
  ]

  const darkModeOptions: { label: string; value: ColorSchemeName }[] = [
    { label: i18n.t('device'), value: undefined },
    { label: i18n.t('dark'), value: 'dark' },
    { label: i18n.t('light'), value: 'light' },
  ]

  const startOfWeekOptions = [
    { label: 'Sunday', value: 0 },
    { label: 'Monday', value: 1 },
    { label: 'Tuesday', value: 2 },
    { label: 'Wednesday', value: 3 },
    { label: 'Thursday', value: 4 },
    { label: 'Friday', value: 5 },
    { label: 'Saturday', value: 6 },
  ]

  const timeDisplayOptions: { label: string; value: MinuteDisplayFormat }[] = [
    { label: i18n.t('decimalExample'), value: 'decimal' },
    { label: i18n.t('shortExample'), value: 'short' },
  ]

  return (
    <View style={{ gap: 3 }}>
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
          label={i18n.t('timeDisplayFormat')}
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
      <Divider marginVertical={20} />
      <Section style={{ paddingLeft: 20, paddingRight: 20 }} noPadding>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('map')}
        </Text>
        <MapKey />
      </Section>
    </View>
  )
}

export default AppearancePreferencesSection
