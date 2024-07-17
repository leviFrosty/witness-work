import { View, Platform, Alert } from 'react-native'
import { useState } from 'react'
import Section from '../components/inputs/Section'
import InputRowContainer from '../components/inputs/InputRowContainer'
import useTheme from '../contexts/theme'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import * as Crypto from 'expo-crypto'
import RNDateTimePicker, {
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import moment from 'moment'
import { ServiceReport } from '../types/serviceReport'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '../stacks/RootStack'
import i18n, { TranslationKey } from '../lib/locales'
import AndroidDateTimePicker from '../components/AndroidDateTimePicker'
import Wrapper from '../components/layout/Wrapper'
import Select from '../components/Select'
import { usePreferences } from '../stores/preferences'
import TextInput from '../components/TextInput'
import Button from '../components/Button'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { getLocales } from 'expo-localization'
import { useToastController } from '@tamagui/toast'

type AddTimeScreenProps = NativeStackScreenProps<RootStackParamList, 'Add Time'>

const AddTimeScreen = ({ route }: AddTimeScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { serviceReportTags, set } = usePreferences()
  const presetCategories: TranslationKey[] = ['standard', 'ldc']
  const timeEntryCategories: TranslationKey | string[] = [
    ...presetCategories,
    ...serviceReportTags,
    'custom',
  ]

  const {
    addServiceReport,
    serviceReports,
    updateServiceReport,
    deleteServiceReport,
  } = useServiceReport()
  const existingServiceReport = serviceReports.find(
    (r) => r.id === route.params?.id
  )
  const [category, setCategory] = useState(
    existingServiceReport?.ldc
      ? timeEntryCategories[1]
      : existingServiceReport?.tag ?? timeEntryCategories[0]
  )
  const [customCategory, setCustomCategory] = useState<string>('')
  const nearestFiveMinutes = Math.floor((route.params?.minutes || 0) / 5) * 5
  const [serviceReport, setServiceReport] = useState<ServiceReport>({
    id: existingServiceReport?.id ?? Crypto.randomUUID(),
    hours: existingServiceReport?.hours || route.params?.hours || 0,
    minutes: existingServiceReport?.minutes ?? nearestFiveMinutes,
    date: moment(existingServiceReport?.date ?? route.params?.date).toDate(),
    ldc: existingServiceReport?.ldc ?? false,
  })
  const toast = useToastController()

  const handleSetCategory = (type: string) => {
    switch (type) {
      case 'standard':
        setCategory(type)
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: undefined,
        })
        break

      case 'ldc':
        setCategory(type)
        setServiceReport({
          ...serviceReport,
          ldc: true,
          tag: undefined,
        })
        break

      case 'custom':
        setCategory(type)
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: customCategory,
        })
        break

      default:
        setCategory(type)
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: type,
        })
    }
  }

  const setHours = (hours: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
    })
  }
  const setMinutes = (minutes: number) => {
    setServiceReport({
      ...serviceReport,
      minutes,
    })
  }

  const handleDateChange = (_: DateTimePickerEvent, date: Date | undefined) => {
    if (!date) {
      return
    }
    setServiceReport({
      ...serviceReport,
      date,
    })
  }

  const handleAddCustomCategory = () => {
    set({ serviceReportTags: [...serviceReportTags, customCategory] })
    handleSetCategory(customCategory)
  }

  const minuteOptions = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(
    (value) => ({
      label: `${value}`,
      value,
    })
  )

  const handleDeleteCustomCategory = () => {
    set({
      serviceReportTags: [...serviceReportTags].filter((t) => t !== category),
    })
    setCategory(presetCategories[0])
    setServiceReport({
      ...serviceReport,
      tag: undefined,
    })
  }

  const typeOptions = timeEntryCategories.map((value) => ({
    /**
     * This allows i18n to translate to provided keys automatically. If the user
     * inputs their own custom category that doesn't have a valid translation,
     * it will default to the to the user input value instead of saying "missing
     * translation".
     *
     * @example
     *   ;```ts
     *
     *   const timeEntryCategories = ['custom', 'Bethel'] // Bethel is user input
     *   const typeOptions = timeEntryCategories.map((value) => ({
     *    label: i18n.t(value as TranslationKey, { defaultValue: value }),
     *   value,
     *   })) // [{ label: 'custom', value: 'custom' }, { label: 'Bethel', value: 'Bethel' } ]
     *
     *   ```
     */
    label: i18n.t(value as TranslationKey, { defaultValue: value }),
    value,
  }))

  const hourOptions = [...Array(24).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const submit = () => {
    addServiceReport(serviceReport)
    toast.show(i18n.t('success'), {
      message: i18n.t('timeAdded'),
      native: true,
    })
    navigation.goBack()
  }

  const save = () => {
    updateServiceReport(serviceReport)
    toast.show(i18n.t('success'), {
      message: i18n.t('updated'),
      native: true,
    })
    navigation.goBack()
  }

  const handleRequestDelete = () => {
    Alert.alert(i18n.t('deleteTime_title'), i18n.t('deleteTime_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteServiceReport(serviceReport.id)
          toast.show(i18n.t('success'), {
            message: i18n.t('deleted'),
            native: true,
          })
          navigation.goBack()
        },
      },
    ])
  }

  const hasEnteredTime =
    serviceReport.hours !== 0 || serviceReport.minutes !== 0
  const hasSelectedCategory = category !== 'custom'
  const submittable = hasEnteredTime && hasSelectedCategory

  return (
    <Wrapper
      style={{
        flex: 1,
        flexGrow: 1,
        justifyContent: 'space-between',
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: 'space-between',
          paddingBottom: insets.bottom + 30,
        }}
      >
        <View style={{ gap: 30 }}>
          <View style={{ padding: 25, gap: 5 }}>
            <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
              {i18n.t(existingServiceReport ? 'updateTime' : 'addTime')}
            </Text>
            <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
              {i18n.t(
                existingServiceReport
                  ? 'updateTime_description'
                  : 'addTime_description'
              )}
            </Text>
          </View>
          <Section>
            <InputRowContainer
              label={i18n.t('date')}
              justifyContent='space-between'
            >
              {Platform.OS !== 'android' ? (
                <RNDateTimePicker
                  locale={getLocales()[0].languageCode || undefined}
                  maximumDate={moment().toDate()}
                  value={serviceReport.date}
                  onChange={handleDateChange}
                />
              ) : (
                <AndroidDateTimePicker
                  value={serviceReport.date}
                  onChange={handleDateChange}
                  maximumDate={moment().toDate()}
                />
              )}
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t('type')}
              lastInSection
              justifyContent='space-between'
            >
              <View style={{ gap: 5, flexGrow: 1 }}>
                <View style={{ flexGrow: 1 }}>
                  <Select
                    data={typeOptions}
                    onChange={({ value }) => handleSetCategory(value)}
                    value={category}
                  />
                </View>

                {category === 'custom' ? (
                  <View style={{ flexDirection: 'row', gap: 5 }}>
                    <View style={{ flex: 1, flexGrow: 1 }}>
                      <TextInput
                        maxLength={20}
                        style={{
                          borderColor: theme.colors.border,
                          borderWidth: 1,
                          borderRadius: theme.numbers.borderRadiusSm,
                          paddingVertical: 15,
                          paddingHorizontal: 10,
                          color: theme.colors.text,
                        }}
                        value={customCategory}
                        onChangeText={(c) => setCustomCategory(c)}
                        placeholder={i18n.t('enterCustomCategory')}
                      />
                    </View>
                    <Button
                      style={{
                        backgroundColor:
                          customCategory.length === 0
                            ? theme.colors.accentAlt
                            : theme.colors.accent,
                        borderRadius: theme.numbers.borderRadiusSm,
                        paddingVertical: 15,
                      }}
                      variant='outline'
                      onPress={handleAddCustomCategory}
                      disabled={customCategory.length === 0}
                    >
                      <Text
                        style={{
                          color: theme.colors.textInverse,
                          fontFamily: theme.fonts.semiBold,
                        }}
                      >
                        {i18n.t('add')}
                      </Text>
                    </Button>
                  </View>
                ) : (
                  !presetCategories.includes(category as TranslationKey) && (
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <Button onPress={handleDeleteCustomCategory}>
                        <Text
                          style={{
                            color: theme.colors.textAlt,
                            textDecorationLine: 'underline',
                          }}
                        >
                          {i18n.t('removeCategory')}
                        </Text>
                      </Button>
                    </View>
                  )
                )}
              </View>
            </InputRowContainer>
          </Section>
          <Section>
            {!route.params?.hours &&
            route.params?.minutes !== undefined &&
            route.params.minutes < 5 &&
            serviceReport.hours === 0 &&
            serviceReport.minutes < 5 ? (
              <Text style={{ color: theme.colors.warn }}>
                {i18n.t('providedTimeIsLessThanFiveMinutes')}
              </Text>
            ) : null}
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between' }}
            >
              <View style={{ width: '50%' }}>
                <InputRowContainer label={i18n.t('hours')} lastInSection>
                  <View style={{ flex: 1 }}>
                    <Select
                      data={hourOptions}
                      placeholder={serviceReport.hours.toString()}
                      onChange={({ value }) => setHours(value)}
                      value={serviceReport.hours.toString()}
                    />
                  </View>
                </InputRowContainer>
              </View>
              <View style={{ width: '50%' }}>
                <InputRowContainer label={i18n.t('minutes')} lastInSection>
                  <View style={{ flex: 1 }}>
                    <Select
                      data={minuteOptions}
                      placeholder={serviceReport.minutes.toString()}
                      onChange={({ value }) => setMinutes(value)}
                      value={serviceReport.hours.toString()}
                    />
                  </View>
                </InputRowContainer>
              </View>
            </View>
          </Section>
        </View>
        <View style={{ paddingHorizontal: 20, gap: 10 }}>
          {!submittable && !hasEnteredTime && (
            <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
              {i18n.t('timeNeeded')}
            </Text>
          )}
          {!submittable && !hasSelectedCategory && (
            <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
              {i18n.t('categoryNeeded')}
            </Text>
          )}
          <ActionButton
            disabled={!submittable}
            onPress={existingServiceReport ? save : submit}
          >
            {i18n.t(existingServiceReport ? 'save' : 'submit')}
          </ActionButton>
          {existingServiceReport && (
            <Button
              style={{
                paddingVertical: 12,
                paddingHorizontal: 24,
                backgroundColor: theme.colors.errorTranslucent,
                borderColor: theme.colors.error,
                borderWidth: 1,
                borderRadius: theme.numbers.borderRadiusSm,
              }}
              onPress={handleRequestDelete}
            >
              <Text style={{ color: theme.colors.error, textAlign: 'center' }}>
                {i18n.t('delete')}
              </Text>
            </Button>
          )}
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default AddTimeScreen
