import { View, Alert, Switch } from 'react-native'
import { useCallback, useEffect, useState } from 'react'
import Section from '../components/inputs/Section'
import InputRowContainer from '../components/inputs/InputRowContainer'
import useTheme from '../contexts/theme'
import Text from '../components/MyText'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import * as Crypto from 'expo-crypto'
import { DateTimePickerEvent } from '@react-native-community/datetimepicker'
import moment from 'moment'
import { ServiceReport } from '../types/serviceReport'
import { useNavigation } from '@react-navigation/native'
import { RootStackNavigation, RootStackParamList } from '../stacks/RootStack'
import i18n, { TranslationKey } from '../lib/locales'
import DateTimePicker from '../components/DateTimePicker'
import Wrapper from '../components/layout/Wrapper'
import Select from '../components/Select'
import {
  getTagName,
  ServiceReportTag,
  usePreferences,
} from '../stores/preferences'
import TextInput from '../components/TextInput'
import Button from '../components/Button'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useToastController } from '@tamagui/toast'
import Header from '../components/layout/Header'
import { faTrash } from '@fortawesome/free-solid-svg-icons'
import IconButton from '../components/IconButton'
import usePublisher from '../hooks/usePublisher'
import { getMonthsReports, getReport } from '../lib/serviceReport'

type AddTimeScreenProps = NativeStackScreenProps<RootStackParamList, 'Add Time'>

const AddTimeScreen = ({ route }: AddTimeScreenProps) => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const navigation = useNavigation<RootStackNavigation>()
  const { serviceReportTags, set } = usePreferences()
  const { hasAnnualGoal } = usePublisher()
  const presetCategories: ServiceReportTag[] = [
    { value: 'standard', credit: false },
    { value: 'ldc', credit: true },
  ]
  const timeEntryTags: (TranslationKey | string | ServiceReportTag)[] = [
    ...presetCategories,
    ...serviceReportTags,
    'custom',
  ]

  const {
    addServiceReport,
    serviceReports,
    updateServiceReport,
    deleteServiceReport,
    set: setServiceReportStore,
  } = useServiceReport()
  const existingServiceReport = route.params?.existingReport
    ? getReport(serviceReports, JSON.parse(route.params.existingReport))
    : undefined

  const [tag, setTag] = useState(
    existingServiceReport && existingServiceReport?.report.ldc
      ? timeEntryTags[1]
      : existingServiceReport?.report.tag ?? timeEntryTags[0]
  )
  const [customTag, setCustomTag] = useState<string>('')
  const [serviceReport, setServiceReport] = useState<ServiceReport>({
    id: existingServiceReport?.report.id ?? Crypto.randomUUID(),
    hours: existingServiceReport?.report.hours || route.params?.hours || 0,
    minutes:
      existingServiceReport?.report.minutes ?? (route.params?.minutes || 0),
    date: moment(
      existingServiceReport?.report.date ?? route.params?.date
    ).toDate(),
    ldc: existingServiceReport?.report.ldc ?? false,
    credit: existingServiceReport?.report.credit ?? false,
  })
  const toast = useToastController()

  const handleSetTag = (type: string) => {
    switch (type) {
      case 'standard':
        setTag(type)
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: undefined,
          credit: false,
        })
        break

      case 'ldc':
        setTag(type)
        setServiceReport({
          ...serviceReport,
          ldc: true,
          tag: undefined,
          credit: true,
        })
        break

      case 'custom':
        setTag(type)
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: customTag,
          credit: false,
        })
        break

      default: {
        const savedTag = serviceReportTags.find((tag) => {
          if (typeof tag === 'string') {
            return tag === type
          }
          return tag.value === type
        })

        let credit = false
        if (typeof savedTag === 'object') {
          credit = savedTag.credit
        }

        setTag({ value: type, credit })
        setServiceReport({
          ...serviceReport,
          ldc: false,
          tag: type,
          credit,
        })
      }
    }
  }

  const setHours = (hours: number) => {
    setServiceReport({
      ...serviceReport,
      hours,
    })
  }

  const updateExistingServiceReportsTags = (tag: ServiceReportTag) => {
    const reports = { ...serviceReports }
    for (const year in reports) {
      for (const month in reports[year]) {
        const monthReports = getMonthsReports(
          reports,
          parseInt(month),
          parseInt(year)
        )
        const reportsWithUpdatedCreditTag = monthReports.map((r) => {
          if (r.tag === tag.value) {
            return {
              ...r,
              credit: tag.credit,
            }
          }
          return r
        })
        reports[year][month] = reportsWithUpdatedCreditTag
      }
    }

    setServiceReportStore({ serviceReports: reports })
  }

  const setCredit = (credit: boolean) => {
    setServiceReport({
      ...serviceReport,
      credit,
    })

    // Updates according tag to be credit / or not in preferences
    const tags: (string | ServiceReportTag)[] = [...serviceReportTags].map(
      (t) => {
        if (typeof t === 'string') {
          if (t === serviceReport.tag) {
            return {
              value: t,
              credit,
            }
          }
          return t
        }
        if (t.value === serviceReport.tag) {
          return {
            value: t.value,
            credit,
          }
        }
        return t
      }
    )

    if (serviceReport.tag) {
      updateExistingServiceReportsTags({ credit, value: serviceReport.tag })
    }

    set({ serviceReportTags: tags })
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

  const handleAddCustomTag = () => {
    const alreadyExists = serviceReportTags.some(
      (t) => getTagName(t) === getTagName(customTag)
    )
    handleSetTag(customTag)
    if (alreadyExists) {
      return
    }

    set({
      serviceReportTags: [
        ...serviceReportTags,
        { value: customTag, credit: false },
      ],
    })
  }

  const handleDeleteCustomTag = () => {
    set({
      serviceReportTags: [...serviceReportTags].filter(
        (t) => getTagName(t) !== getTagName(tag)
      ),
    })
    setTag(presetCategories[0])
    setServiceReport({
      ...serviceReport,
      tag: undefined,
    })
  }

  const typeOptions = timeEntryTags.map((tag) => ({
    /**
     * This allows i18n to translate to provided keys automatically. If the user
     * inputs their own custom tag that doesn't have a valid translation, it
     * will default to the to the user input value instead of saying "missing
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
    label: i18n.t(getTagName(tag) as TranslationKey, {
      defaultValue: getTagName(tag),
    }),
    value: getTagName(tag),
  }))

  const hourOptions = [...Array(100).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const minuteOptions = [...Array(60).keys()].map((value) => ({
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

  const handleRequestDelete = useCallback(() => {
    Alert.alert(i18n.t('deleteTime_title'), i18n.t('deleteTime_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('delete'),
        style: 'destructive',
        onPress: () => {
          deleteServiceReport(serviceReport)
          toast.show(i18n.t('success'), {
            message: i18n.t('deleted'),
            native: true,
          })
          navigation.goBack()
        },
      },
    ])
  }, [deleteServiceReport, navigation, serviceReport, toast])

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          noInsets
          buttonType='back'
          title={i18n.t(existingServiceReport ? 'updateTime' : 'addTime')}
          rightElement={
            existingServiceReport ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 20,
                  position: 'absolute',
                  right: 10,
                }}
              >
                <IconButton
                  icon={faTrash}
                  color={theme.colors.text}
                  onPress={handleRequestDelete}
                />
              </View>
            ) : undefined
          }
        />
      ),
    })
  }, [
    existingServiceReport,
    handleRequestDelete,
    navigation,
    theme.colors.text,
    theme.colors.textInverse,
  ])

  const hasEnteredTime =
    serviceReport.hours !== 0 || serviceReport.minutes !== 0
  const hasSelectedCategory = tag !== 'custom'
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
              <DateTimePicker
                maximumDate={moment().toDate()}
                value={serviceReport.date}
                onChange={handleDateChange}
              />
            </InputRowContainer>
            <InputRowContainer
              label={i18n.t('type')}
              lastInSection
              justifyContent='space-between'
            >
              <View
                style={{
                  gap: 5,
                  width: '100%',
                  flexShrink: 1,
                }}
              >
                <Select
                  data={typeOptions}
                  style={{ width: '100%', flex: 1 }}
                  onChange={({ value: c }) => {
                    handleSetTag(c)
                  }}
                  value={getTagName(tag)}
                />
                {getTagName(tag) === 'custom' ? (
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
                        onChangeText={(c) => setCustomTag(c)}
                        value={customTag}
                        placeholder={i18n.t('enterCustomCategory')}
                      />
                    </View>
                    <Button
                      style={{
                        backgroundColor:
                          customTag.length === 0
                            ? theme.colors.accentAlt
                            : theme.colors.accent,
                        borderRadius: theme.numbers.borderRadiusSm,
                        paddingVertical: 15,
                      }}
                      variant='outline'
                      onPress={handleAddCustomTag}
                      disabled={customTag.length === 0}
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
                  typeof tag === 'object' &&
                  !presetCategories.map((c) => c.value).includes(tag.value) && (
                    <View
                      style={{
                        gap: 5,
                        flexShrink: 1,
                      }}
                    >
                      {hasAnnualGoal && (
                        <View
                          style={{
                            borderWidth: 1,
                            borderRadius: theme.numbers.borderRadiusSm,
                            padding: 10,
                            borderColor: theme.colors.border,
                            gap: 10,
                          }}
                        >
                          <View
                            style={{
                              flexDirection: 'row',
                              flexShrink: 1,
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text
                              style={{
                                fontFamily: theme.fonts.semiBold,
                                fontSize: theme.fontSize('lg'),
                              }}
                            >
                              {i18n.t('credit')}
                            </Text>
                            <Switch
                              value={
                                serviceReport.ldc
                                  ? true
                                  : serviceReport.credit ?? false
                              }
                              onValueChange={(val) => setCredit(val)}
                              disabled={presetCategories.includes(tag)}
                            />
                          </View>
                          <Text
                            style={{
                              fontSize: theme.fontSize('sm'),
                              color: theme.colors.textAlt,
                            }}
                          >
                            {i18n.t('credit_description')}
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'flex-end',
                        }}
                      >
                        <Button onPress={handleDeleteCustomTag}>
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
                    </View>
                  )
                )}
              </View>
            </InputRowContainer>
          </Section>
          <Section>
            {!route.params?.hours &&
            route.params?.minutes !== undefined &&
            route.params.minutes < 1 &&
            serviceReport.hours === 0 &&
            serviceReport.minutes < 1 ? (
              <Text style={{ color: theme.colors.warn }}>
                {i18n.t('providedTimeIsLessThanOneMinute')}
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
        <View style={{ paddingHorizontal: 20, gap: 8, paddingTop: 20 }}>
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
        </View>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default AddTimeScreen
