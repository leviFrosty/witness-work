import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Text from '../components/MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import { View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ActionButton from '../components/ActionButton'
import useServiceReport from '../stores/serviceReport'
import useContacts from '../stores/contactsStore'
import Card from '../components/Card'
import XView from '../components/layout/XView'
import Constants from 'expo-constants'
import { hasMigratedFromAsyncStorage } from '../stores/mmkv'
import useConversations from '../stores/conversationStore'
import axios from 'axios'
import moment from 'moment'
import { useToastController } from '@tamagui/toast'
import { RecurringPlanFrequencies } from '../lib/serviceReport'
import { useState } from 'react'
import Button from '../components/Button'
import { useTimeCache } from '../stores/timeCache'
import { PREFERENCE_DEFAULTS, usePreferences } from '../stores/preferences'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { mmkvStorage } from '../stores/mmkv'
import DateTimePicker from '../components/DateTimePicker'
import SupporterBadge from '../components/SupporterBadge'
import useIsSupporter from '../hooks/useIsSupporter'

export default function ToolsScreen() {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const {
    serviceReports,
    dayPlans,
    recurringPlans,
    _WARNING_forceDeleteServiceReports,
    addServiceReport,
    addDayPlan,
    addRecurringPlan,
    set: setServiceReports,
  } = useServiceReport()
  const {
    contacts,
    _WARNING_forceDeleteContacts,
    _WARNING_clearDeleted,
    addContact,
  } = useContacts()
  const { cache, invalidateAllCache } = useTimeCache()
  const { addConversation, _WARNING_forceDeleteConversations } =
    useConversations()
  const toast = useToastController()
  const [showContacts, setShowContacts] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [showTimeCache, setShowTimeCache] = useState(false)
  const {
    devSupporterOverride,
    hasCompletedProfileSetup,
    name,
    set: setPreferences,
  } = usePreferences()
  const { isSupporter, since: supporterSince } = useIsSupporter()

  const generateContacts = async () => {
    const { data } = await axios.get(
      'https://jsonplaceholder.typicode.com/users'
    )
    if (Array.isArray(data)) {
      data.forEach((contact, index) => {
        addContact({
          createdAt: moment()
            .subtract(index + 1 * 3, 'weeks')
            .toDate(),
          id: `generated-${index}`,
          name: contact.name,
          address: {
            line1: contact.address.street,
            city: contact.address.city,
            zip: contact.address.zipcode,
          },
          coordinate: {
            latitude: contact.address.geo.lat,
            longitude: contact.address.geo.lng,
          },
          email: contact.email,
          customFields: contact.company,
          phone: contact.phone,
          isFavorite: index < 2, // First 2 contacts are favorites
        })
      })

      // Generate conversations for each contact
      data.forEach((_: unknown, index: number) => {
        const contactId = `generated-${index}`
        const conversationCount = index < 4 ? 5 : 2

        for (let j = 0; j < conversationCount; j++) {
          addConversation({
            id: `generated-conv-${index}-${j}`,
            contact: { id: contactId },
            date: moment()
              .subtract(j * 5 + index, 'days')
              .toDate(),
            note: j === 0 ? 'Discussed chapter 3' : '',
            isBibleStudy: index < 3 && j < 3, // First 3 contacts have bible studies
            followUp:
              j === 0 && index < 4
                ? {
                    date: moment()
                      .add(3 + index, 'days')
                      .toDate(),
                    notifyMe: true,
                    topic: 'Continue discussion',
                  }
                : undefined,
          })
        }
      })
    }
  }

  const generateServiceReports = () => {
    const tags = ['Special', 'Campaign', 'Memorial', 'Convention', undefined]
    let i = 0
    while (i < 1000) {
      const reportsForDay = (i * 2654435761) % 4
      for (let j = 0; j <= reportsForDay; j++) {
        const seed = i * 31 + j * 17
        const r = ((seed * 2654435761) % 1000) / 1000
        const hours = Math.floor(Math.pow(r, 2.5) * 17)
        const minutes = (seed * 7) % 12 === 0 ? 0 : ((seed * 7) % 12) * 5
        if (hours === 0 && minutes === 0) continue
        addServiceReport({
          date: moment().subtract(i, 'day').toDate(),
          hours,
          id: `generated-${i}-${j}`,
          minutes,
          credit: seed % 3 === 0,
          ldc: seed % 5 === 0,
          tag: tags[seed % tags.length],
        })
      }
      const gapR = ((i * 2654435761 + 12345) % 1000) / 1000
      const gap = Math.floor(Math.pow(gapR, 2.5) * 7) + 1
      i += gap
    }
  }

  const generateServicePlans = () => {
    for (let i = 0; i < 30; i++) {
      if (i < 3) {
        addRecurringPlan({
          id: `generated-${i}`,
          minutes: 60,
          recurrence: {
            frequency: RecurringPlanFrequencies.WEEKLY,
            endDate: null,
            interval: 1,
          },
          startDate: moment()
            .subtract(i + 7, 'days')
            .toDate(),
          note: i === 3 ? 'Note' : '',
        })
      } else {
        let date = moment()
        if (i < 15) {
          date = moment().subtract(i, 'days')
        } else {
          date = moment().add(Math.floor(i / 2), 'days')
        }
        addDayPlan({
          date: date.toDate(),
          id: `generated-${i}`,
          minutes: 120 + i * 10,
        })
      }
    }
  }

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top,
        paddingHorizontal: 10,
      }}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={{ gap: 15, paddingTop: 30, paddingBottom: 300 }}
      >
        <Text
          style={{
            fontSize: theme.fontSize('4xl'),
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('developerTools')}
        </Text>
        <Card>
          <Text>{i18n.t('metadata')}</Text>
          <View>
            <XView>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t('appVersion')}:
              </Text>
              <Text>
                {Constants.expoConfig?.version
                  ? Constants.expoConfig?.version
                  : i18n.t('versionUnknown')}
              </Text>
            </XView>
            <XView>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t('migratedToMmkv')}:
              </Text>
              <Text>{`${hasMigratedFromAsyncStorage()}`}</Text>
            </XView>
          </View>
        </Card>

        <Card style={{ gap: 10 }}>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              Supporter override
            </Text>
            {isSupporter && <SupporterBadge />}
          </XView>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            {devSupporterOverride
              ? 'Forcing supporter status on. Bypasses RevenueCat.'
              : 'Off. useIsSupporter reads real RevenueCat state.'}
          </Text>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>Current isSupporter:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {String(isSupporter)}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>Current since:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {supporterSince ? moment(supporterSince).format('ll') : '—'}
            </Text>
          </XView>
          {devSupporterOverride ? (
            <>
              <XView style={{ justifyContent: 'space-between' }}>
                <Text>Override since:</Text>
                <DateTimePicker
                  value={new Date(devSupporterOverride)}
                  maximumDate={new Date()}
                  onChange={(_, date) => {
                    if (date) setPreferences({ devSupporterOverride: date })
                  }}
                />
              </XView>
              <ActionButton
                onPress={() => setPreferences({ devSupporterOverride: null })}
              >
                Disable supporter override
              </ActionButton>
            </>
          ) : (
            <>
              <ActionButton
                onPress={() =>
                  setPreferences({ devSupporterOverride: new Date() })
                }
              >
                Enable as supporter (today)
              </ActionButton>
              <ActionButton
                onPress={() =>
                  setPreferences({
                    devSupporterOverride: moment()
                      .subtract(2, 'years')
                      .toDate(),
                  })
                }
              >
                Enable as supporter (2 years ago)
              </ActionButton>
            </>
          )}
        </Card>

        <Card style={{ gap: 10 }}>
          <Text style={{ fontFamily: theme.fonts.bold }}>
            Simulate pre-profile-feature user
          </Text>
          <Text
            style={{
              fontSize: theme.fontSize('sm'),
              color: theme.colors.textAlt,
            }}
          >
            Keeps onboardingComplete=true but clears profile fields so the
            post-update prompt re-appears. Use this to validate the upgrade flow
            for existing users.
          </Text>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>hasCompletedProfileSetup:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {String(hasCompletedProfileSetup)}
            </Text>
          </XView>
          <XView style={{ justifyContent: 'space-between' }}>
            <Text>name:</Text>
            <Text style={{ fontFamily: theme.fonts.bold }}>
              {name ? name : '—'}
            </Text>
          </XView>
          <ActionButton
            onPress={() => {
              setPreferences({
                onboardingComplete: true,
                hasCompletedProfileSetup: false,
                name: '',
                pioneerStartDate: null,
                avatar: { type: 'none', value: '' },
              })
              toast.show('Reset to pre-profile state', {
                message: '',
                native: true,
              })
            }}
          >
            Reset profile data (keep onboarded)
          </ActionButton>
        </Card>

        <Card style={{ gap: 5 }}>
          <Text>{i18n.t('generateMockData')}</Text>
          <ActionButton
            onPress={() => {
              generateContacts()
              toast.show(i18n.t('generated'), { message: '', native: true })
            }}
          >
            {i18n.t('contacts')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              generateServiceReports()
              toast.show(i18n.t('generated'), { message: '', native: true })
            }}
          >
            {i18n.t('serviceReports')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              generateServicePlans()
              toast.show(i18n.t('generated'), { message: '', native: true })
            }}
          >
            {i18n.t('servicePlans')}
          </ActionButton>
        </Card>
        <Card style={{ gap: 5 }}>
          <Text style={{ color: theme.colors.warn }}>
            {i18n.t('dangerZone')}
          </Text>
          <ActionButton
            onPress={() => {
              _WARNING_forceDeleteContacts()
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('forceDeleteContacts')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              _WARNING_forceDeleteServiceReports()
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('deleteReports')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              setServiceReports({ dayPlans: [] })
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('deleteDayPlans')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              setServiceReports({ recurringPlans: [] })
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('deleteRecurringPlans')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              _WARNING_clearDeleted()
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('clearArchivedContacts')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              _WARNING_forceDeleteConversations()
              toast.show(i18n.t('deleted'), { message: '', native: true })
            }}
          >
            {i18n.t('deleteAllConversations')}
          </ActionButton>
          <ActionButton
            onPress={() => {
              _WARNING_forceDeleteContacts()
              _WARNING_clearDeleted()
              _WARNING_forceDeleteServiceReports()
              setServiceReports({ dayPlans: [], recurringPlans: [] })
              _WARNING_forceDeleteConversations()
              invalidateAllCache()
              setPreferences(PREFERENCE_DEFAULTS)
              mmkvStorage.clearAll()
              void AsyncStorage.clear()
              toast.show('All data cleared — restart the app', {
                message: '',
                native: true,
              })
            }}
          >
            Reset all (fresh install)
          </ActionButton>
        </Card>
        <Card>
          <XView>
            <Text>{i18n.t('contacts')}</Text>
            <Button onPress={() => setShowContacts(!showContacts)}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t(showContacts ? 'hide' : 'show')}
              </Text>
            </Button>
          </XView>
          {showContacts && (
            <Text style={{ fontSize: theme.fontSize('xs') }}>
              {JSON.stringify(contacts, null, 2)}
            </Text>
          )}
        </Card>
        <Card>
          <XView>
            <Text>{i18n.t('serviceReports')}</Text>
            <Button onPress={() => setShowReports(!showReports)}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t(showReports ? 'hide' : 'show')}
              </Text>
            </Button>
          </XView>
          {showReports && (
            <Text style={{ fontSize: theme.fontSize('xs') }}>
              {JSON.stringify(serviceReports, null, 2)}
            </Text>
          )}
        </Card>
        <Card>
          <XView>
            <Text>{i18n.t('plans')}</Text>
            <Button onPress={() => setShowPlans(!showPlans)}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t(showPlans ? 'hide' : 'show')}
              </Text>
            </Button>
          </XView>
          {showPlans && (
            <View style={{ gap: 20 }}>
              <View>
                <Text>{i18n.t('dayPlans')}</Text>
                <Text style={{ fontSize: theme.fontSize('xs') }}>
                  {JSON.stringify(dayPlans, null, 2)}
                </Text>
              </View>
              <View>
                <Text>{i18n.t('recurringPlans')}</Text>
                <Text style={{ fontSize: theme.fontSize('xs') }}>
                  {JSON.stringify(recurringPlans, null, 2)}
                </Text>
              </View>
            </View>
          )}
        </Card>
        <Card>
          <XView>
            <Text>{i18n.t('cache')}</Text>
            <Button onPress={() => setShowTimeCache(!showTimeCache)}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t(showTimeCache ? 'hide' : 'show')}
              </Text>
            </Button>
          </XView>
          {showTimeCache && (
            <View style={{ gap: 20 }}>
              <View>
                <Text>{i18n.t('timeCache')}</Text>
                <Text style={{ fontSize: theme.fontSize('xs') }}>
                  {JSON.stringify(cache, null, 2)}
                </Text>
              </View>
            </View>
          )}
        </Card>
      </KeyboardAwareScrollView>
    </View>
  )
}
