import { useEffect, useState } from 'react'
import { Alert, Linking, View } from 'react-native'
import {
  calendarBridge,
  type CalendarDestination,
  type CalendarSource,
} from '../../../../../modules/calendar-bridge'
import {
  calendarAction,
  calendarDestinations,
  connectCalendar,
  createCalendar,
  disconnectCalendar,
  publishCalendar,
  refreshPublishing,
  setSharedOptions,
} from '@/app/calendar/calendarSync'
import { useCalendarPublishing, useCalendarSync } from '@/stores/calendarSync'
import Section from '@/components/ui/inputs/Section'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import PrimaryDeviceSection from '@/features/settings/components/calendar/PrimaryDeviceSection'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatRelative } from '@/lib/dates'
import i18n, { type TranslationKey } from '@/lib/locales'

export default function CalendarSettings() {
  const theme = useTheme()
  const settings = useCalendarSync()
  const { state, deviceId, working, error } = useCalendarPublishing()
  const [destinations, setDestinations] = useState<CalendarDestination[]>([])
  const [sources, setSources] = useState<CalendarSource[]>([])
  const [loaded, setLoaded] = useState(false)
  const isPrimary = !!deviceId && state?.primary === deviceId
  // With no primary yet, connecting claims it for this device.
  const canPublishHere = !!state && (!state.primary || isPrimary)
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
    void calendarAction(refreshPublishing).catch(() => undefined)
  }, [])
  const run = (action: () => Promise<unknown>) => {
    void calendarAction(action).catch(() => undefined)
  }
  const loadCalendars = () => {
    Alert.alert(i18n.t('calendarSync'), i18n.t('calendarAccessExplanation'), [
      { text: i18n.t('cancel'), style: 'cancel' },
      {
        text: i18n.t('continue'),
        onPress: () =>
          run(async () => {
            setDestinations(await calendarDestinations())
            setSources(await calendarBridge().sources())
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
        { text: i18n.t('cancel'), style: 'cancel' },
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
      const match = calendars.find(
        (calendar) =>
          calendar.title === shared?.title &&
          calendar.account === shared?.account
      )
      if (match) {
        await connectCalendar(match)
        return
      }
      setDestinations(calendars)
      setSources(await calendarBridge().sources())
      setLoaded(true)
      throw new Error('CALENDAR_SHARED_NOT_FOUND')
    })
  }
  const disconnect = () =>
    Alert.alert(
      i18n.t('calendarDisconnect'),
      i18n.t('calendarDisconnectDescription'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('calendarKeepEvents'),
          onPress: () => run(() => disconnectCalendar(false)),
        },
        ...(isPrimary
          ? [
              {
                text: i18n.t('calendarRemoveEvents'),
                style: 'destructive' as const,
                onPress: () => run(() => disconnectCalendar(true)),
              },
            ]
          : []),
      ]
    )
  const status = settings.enabled
    ? isPrimary
      ? settings.lastSyncedAt
        ? i18n.t('calendarLastSynced', {
            when: formatRelative(settings.lastSyncedAt),
          })
        : i18n.t('calendarWaiting')
      : i18n.t('calendarPublishedElsewhere', {
          device: primaryName ?? i18n.t('calendarNotConfigured'),
        })
    : settings.sharedCalendar && !canPublishHere
      ? i18n.t('calendarPublishedElsewhere', {
          device: primaryName ?? i18n.t('calendarNotConfigured'),
        })
      : i18n.t('calendarDisconnected')
  const note = { fontSize: 12, color: theme.colors.textAlt }
  const padded = { paddingHorizontal: inputLayout.horizontalPadding }
  return (
    <View style={{ gap: 30 }}>
      <View style={[padded, { gap: 6 }]}>
        <Text style={{ fontSize: 13, color: theme.colors.textAlt }}>
          {i18n.t('calendarDescription')}
        </Text>
      </View>

      <View style={{ gap: 8 }}>
        <View>
          <SectionTitle text={i18n.t('calendar')} />
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
                  label={i18n.t('iCloudSyncNow')}
                  disabled={working || !isPrimary}
                  onPress={() => run(publishCalendar)}
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
                label={i18n.t('calendarChecking')}
                disabled
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
            error === 'calendarPermissionError') && (
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
                  label={i18n.t('calendarOpenSettings')}
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
              <SectionTitle text={i18n.t('calendarExistingCalendars')} />
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
              <SectionTitle text={i18n.t('calendarNewCalendar')} />
              <Section>
                {sources.map((source, index) => (
                  <InputRowButton
                    key={source.id}
                    label={i18n.t('calendarCreateIn', {
                      account: source.title,
                    })}
                    disabled={working}
                    onPress={() => run(() => createCalendar(source.id))}
                    lastInSection={index === sources.length - 1}
                  />
                ))}
              </Section>
            </View>
          )}
          <Text style={[note, padded]}>{i18n.t('calendarGoogleSetup')}</Text>
        </View>
      )}

      <View>
        <SectionTitle text={i18n.t('calendarOptions')} />
        <Section>
          <InputRowSwitch
            label={i18n.t('calendarDefaultInclude')}
            value={settings.defaultInclude}
            onValueChange={(defaultInclude) =>
              run(() => setSharedOptions({ defaultInclude }))
            }
          />
          <InputRowSwitch
            label={i18n.t('calendarIncludeDetails')}
            description={i18n.t('calendarDetailsDescription')}
            value={settings.includeDetails}
            onValueChange={(includeDetails) =>
              run(() => setSharedOptions({ includeDetails }))
            }
            lastInSection
          />
        </Section>
      </View>

      <PrimaryDeviceSection />

      <View style={[padded, { gap: 8 }]}>
        <Text style={note}>{i18n.t('calendarOwnershipExplanation')}</Text>
        <Text style={note}>{i18n.t('calendarUninstallExplanation')}</Text>
      </View>
    </View>
  )
}
