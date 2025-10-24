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
import { history } from '../lib/logger'

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
  const { cache } = useTimeCache()
  const { _WARNING_forceDeleteConversations } = useConversations()
  const toast = useToastController()
  const [showContacts, setShowContacts] = useState(false)
  const [showReports, setShowReports] = useState(false)
  const [showPlans, setShowPlans] = useState(false)
  const [showTimeCache, setShowTimeCache] = useState(false)
  const [showLogHistory, setShowLogHistory] = useState(false)

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
        })
      })
    }
  }

  const generateServiceReports = () => {
    for (let i = 0; i < 1000; i++) {
      addServiceReport({
        date: moment().subtract(i, 'day').toDate(),
        hours: 1,
        id: `generated-${i}`,
        minutes: 0,
        credit: i % 2 === 0,
        ldc: i % 3 === 0,
        tag: i % 2 === 0 ? 'Special' : undefined,
      })
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
        <Card>
          <XView>
            <Text>{i18n.t('logs')}</Text>
            <Button onPress={() => setShowLogHistory(!showLogHistory)}>
              <Text style={{ fontFamily: theme.fonts.bold }}>
                {i18n.t(showLogHistory ? 'hide' : 'show')}
              </Text>
            </Button>
          </XView>
          {showLogHistory && (
            <View style={{ gap: 20 }}>
              <View>
                <Text>{i18n.t('logs')}</Text>
                <Text style={{ fontSize: theme.fontSize('2xs') }}>
                  <View style={{ minHeight: 100 }}>
                    {/* <FlashList
                      data={history}
                      renderItem={({ item }) => (
                        <View
                          key={item.id}
                          style={{ display: 'flex', gap: 4, paddingBottom: 5 }}
                        >
                          <Text style={{ fontFamily: theme.fonts.semiBold }}>
                            {moment(item.timestamp).format(
                              'YYYY-MM-DD HH:mm:ss'
                            )}
                          </Text>
                          <Text>{item.message}</Text>
                        </View>
                      )}
                    /> */}
                    {history.map((log) => (
                      <View
                        key={log.id}
                        style={{ display: 'flex', gap: 4, paddingBottom: 5 }}
                      >
                        <Text style={{ fontFamily: theme.fonts.semiBold }}>
                          {moment(log.timestamp).format('YYYY-MM-DD HH:mm:ss')}
                        </Text>
                        <Text>{log.message}</Text>
                      </View>
                    ))}
                  </View>
                </Text>
              </View>
            </View>
          )}
        </Card>
      </KeyboardAwareScrollView>
    </View>
  )
}
