import { useEffect, useState } from 'react'
import { Alert, Linking, Platform, View } from 'react-native'
import { useToastController } from '@tamagui/toast'
import type {
  CalendarDestination,
  CalendarSource,
} from '../../../../../modules/calendar-bridge'
import {
  calendarAction,
  calendarDestinations,
  calendarSources,
  connectCalendar,
  createCalendar,
  publishCalendar,
  refreshPublishing,
  setSharedOptions,
} from '@/app/calendar/calendarSync'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import { confirmDisconnectCalendar } from '@/app/calendar/confirmDisconnectCalendar'

import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import PrimaryDeviceSection from '@/features/settings/components/calendar/PrimaryDeviceSection'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'

/** Android publishes from this device alone: no primary device or iCloud. */
const android = Platform.OS === 'android'

export default function CalendarSettings() {
  const theme = useTheme()
  const toast = useToastController()
  const settings = useCalendarSync()
  const { state, deviceId, working, error } = useCalendarPublishing()
  const [destinations, setDestinations] = useState<CalendarDestination[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [loaded, setLoaded] = useState(false)
  const isPrimary = android || (!!deviceId && state?.primary === deviceId)
  // With no primary yet, connecting claims it for this device.
  const canPublishHere = android || (!!state && (!state.primary || isPrimary))
  const primaryName = state?.devices.find(
    (device) => device.id === state.primary
  )?.name
  // The calendar in use across devices wins over one this device used before.
  const shared = settings.sharedCalendar
  const local = settings.destination
  const localIsShared =
    !!local &&
    (!shared ||
      (local.title === shared.title && local.account === shared.account))
  const suggested = localIsShared ? local : shared
  useEffect(() => {
    if (android) return
    void calendarAction(refreshPublishing).catch(() => undefined)
  }, [])
  const run = (action: () => Promise<unknown>) => {
    void calendarAction(action).catch(() => undefined)
  }
  const loadCalendars = () => {
    Alert.alert(i18n.t('calendarSync'), i18n.t('calendarAccessExplanation'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
      },
      {
        text: i18n.t('continue'),
        onPress: () =>
          run(async () => {
            setDestinations(await calendarDestinations())
            setSources(await calendarSources())
            setLoaded(true)
          }),
      },
    ])
  }
  const adopt = (destination: CalendarDestination) => {
    Alert.alert(
      i18n.t('calendarChooseDestination'),
      i18n.t('calendarAdoptConfirm', {
        calendar: destination.title,
        account: destination.account,
      }),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel',
        },
        {
          text: i18n.t('continue'),
          onPress: () => run(() => connectCalendar(destination)),
        },
      ]
    )
  }
  const reconnect = () => {
    if (localIsShared && local) return adopt(local)
    // A calendar connected on another device: find it here by name.
    run(async () => {
      const calendars = await calendarDestinations()
      const matches = calendars.filter(
        (calendar) =>
          calendar.title === shared?.title &&
          calendar.account === shared?.account
      )
      if (matches.length === 1) {
        await connectCalendar(matches[0])
        return
      }
      setDestinations(calendars)
      setSources(await calendarSources())
      setLoaded(true)
      throw new Error('CALENDAR_SHARED_NOT_FOUND')
    })
  }
  const syncNow = () =>
    run(async () => {
      await publishCalendar()
      toast.show(i18n.t('calendarSynced'), {
        message: i18n.t('calendarUpcomingCount' as TranslationKey, {
          count: useCalendarSync.getState().upcomingCount,
        }),
        native: true,
      })
    })
  const disconnect = () =>
    confirmDisconnectCalendar({ isPrimary, source: 'settings' })
  const status = settings.enabled
    ? isPrimary
      ? settings.lastSyncedAt
        ? [
            i18n.t('calendarUpcomingCount' as TranslationKey, {
              count: settings.upcomingCount,
            }),
            i18n.t('calendarLastSynced', {
              when: formatRelative(settings.lastSyncedAt),
            }),
          ].join(' · ')
        : i18n.t('calendarWaiting')
      : i18n.t('calendarPublishedElsewhere', {
          device: primaryName ?? i18n.t('calendarNotConfigured'),
        })
    : settings.sharedCalendar && !canPublishHere
      ? i18n.t('calendarPublishedElsewhere', {
          device: primaryName ?? i18n.t('calendarNotConfigured'),
        })
      : i18n.t('calendarDisconnected')
  const googleSetup = i18n.t(
    android ? 'calendarGoogleSetupAndroid' : 'calendarGoogleSetup'
  )
  const note = { fontSize: 12, color: theme.colors.textAlt }
  const padded = { paddingHorizontal: inputLayout.horizontalPadding }
  return (
    <View style={{ gap: 30 }}>
      <Text style={[padded, { fontSize: 13, color: theme.colors.textAlt }]}>
        {i18n.t('calendarDescription')}
      </Text>

      <View style={{ gap: 8 }}>
        <View>
          <SectionTitle
            text={i18n.t('calendar')}
            info={i18n.t(
              android ? 'calendarHowItWorksAndroid' : 'calendarHowItWorks'
            )}
          />
          <Section>
            {settings.enabled && settings.destination && (
              <InputRowButton
                label={settings.destination.title}
                sublabel={`${settings.destination.account} · ${status}`}
              />
            )}
            {settings.enabled ? (
              <>
                <InputRowButton
                  label={i18n.t(working ? 'calendarSyncing' : 'iCloudSyncNow')}
                  disabled={working || !isPrimary}
                  onPress={syncNow}
                />
                <InputRowButton
                  label={i18n.t('calendarDisconnect')}
                  disabled={working}
                  onPress={disconnect}
                  lastInSection
                />
              </>
            ) : canPublishHere ? (
              <>
                {suggested && (
                  <InputRowButton
                    label={i18n.t('calendarReconnect', {
                      calendar: suggested.title,
                    })}
                    sublabel={suggested.account}
                    disabled={working}
                    onPress={reconnect}
                  />
                )}
                <InputRowButton
                  label={i18n.t('calendarChooseDestination')}
                  disabled={working}
                  onPress={loadCalendars}
                  lastInSection
                />
              </>
            ) : !state ? (
              <InputRowButton
                label={i18n.t(
                  error && !working ? 'calendarTryAgain' : 'calendarChecking'
                )}
                disabled={working || !error}
                onPress={() => run(refreshPublishing)}
                lastInSection
              />
            ) : (
              <InputRowButton
                label={status}
                sublabel={i18n.t('calendarPrimaryRequired')}
                lastInSection
              />
            )}
          </Section>
        </View>
        {!settings.enabled && canPublishHere && (
          <Text style={[note, padded]}>{status}</Text>
        )}
      </View>

      {!!error && (
        <View style={{ gap: 8 }}>
          <Text style={[padded, { color: theme.colors.error }]}>
            {i18n.t(error as TranslationKey)}
          </Text>
          {((error === 'calendarWaitingForEvents' &&
            isPrimary &&
            settings.enabled) ||
            error === 'calendarPermissionError' ||
            error === 'calendarPermissionErrorAndroid') && (
            <Section>
              {error === 'calendarWaitingForEvents' ? (
                <InputRowButton
                  label={i18n.t('calendarRepair')}
                  disabled={working}
                  lastInSection
                  onPress={() => {
                    Alert.alert(
                      i18n.t('calendarRepair'),
                      i18n.t('calendarRepairDescription'),
                      [
                        { text: i18n.t('cancel'), style: 'cancel' },
                        {
                          text: i18n.t('calendarRepair'),
                          onPress: () =>
                            run(() => publishCalendar({ repair: true })),
                        },
                      ]
                    )
                  }}
                />
              ) : (
                <InputRowButton
                  label={i18n.t(
                    android
                      ? 'calendarOpenSettingsAndroid'
                      : 'calendarOpenSettings'
                  )}
                  lastInSection
                  onPress={() => {
                    void Linking.openSettings()
                  }}
                />
              )}
            </Section>
          )}
        </View>
      )}

      {!settings.enabled && loaded && (
        <View style={{ gap: 8 }}>
          {destinations.length > 0 && (
            <View>
              <SectionTitle
                text={i18n.t('calendarExistingCalendars')}
                info={googleSetup}
              />
              <Section>
                {destinations.map((destination, index) => (
                  <InputRowButton
                    key={destination.id}
                    label={destination.title}
                    sublabel={destination.account}
                    disabled={working}
                    onPress={() => adopt(destination)}
                    lastInSection={index === destinations.length - 1}
                  />
                ))}
              </Section>
            </View>
          )}
          {sources.length > 0 && (
            <View>
              <SectionTitle
                text={i18n.t('calendarNewCalendar')}
                info={destinations.length ? undefined : googleSetup}
              />
              <Section>
                {sources.map((source, index) => (
                  <InputRowButton
                    key={source.id}
                    label={
                      android
                        ? i18n.t('calendarCreateLocalAndroid')
                        : i18n.t('calendarCreateIn', { account: source.title })
                    }
                    disabled={working}
                    onPress={() => run(() => createCalendar(source.id))}
                    lastInSection={index === sources.length - 1}
                  />
                ))}
              </Section>
            </View>
          )}
        </View>
      )}

      <View>
        <SectionTitle text={i18n.t('calendarOptions')} />
        <Section>
          <InputRowSwitch
            label={i18n.t('calendarIncludeDetails')}
            info={i18n.t(
              android
                ? 'calendarDetailsDescriptionAndroid'
                : 'calendarDetailsDescription'
            )}
            value={settings.includeDetails}
            onValueChange={(includeDetails) =>
              run(() => setSharedOptions({ includeDetails }))
            }
            lastInSection
          />
        </Section>
      </View>

      {!android && <PrimaryDeviceSection />}
    </View>
  )
}
