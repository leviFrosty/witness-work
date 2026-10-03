import { Alert, View } from 'react-native'
import Section from '@/components/ui/inputs/Section'
import Text from '@/components/ui/MyText'
import InputRowButton from '@/features/settings/components/inputs/InputRowButton'
import SectionTitle from '@/features/settings/components/shared/SectionTitle'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import useTheme from '@/contexts/theme'
import {
  calendarAction,
  refreshPublishing,
  removeDevice,
  selectPrimary,
} from '@/app/calendar/calendarSync'
import { useCalendarPublishing } from '@/stores/calendarSync'
import type { CalendarDevice } from '../../../../../modules/calendar-bridge'
import { formatRelative } from '@/lib/dates'
import i18n from '@/lib/locales'

/** Available to everyone: calendar ownership doesn't depend on Supporter. */
export default function PrimaryDeviceSection() {
  const theme = useTheme()
  const { state, deviceId, working } = useCalendarPublishing()
  const run = (action: () => Promise<unknown>) => {
    void calendarAction(action).catch(() => undefined)
  }
  const choose = (device: CalendarDevice) => {
    const inUse =
      device.id === state?.primary ||
      device.id === state?.pending ||
      device.id === state?.busy
    Alert.alert(
      device.name,
      device.id === state?.primary
        ? i18n.t('calendarPrimarySelected')
        : i18n.t('calendarPrimaryConfirm', { device: device.name }),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        ...(device.id !== state?.primary
          ? [
              {
                text: i18n.t('calendarMakePrimary'),
                onPress: () => run(() => selectPrimary(device.id)),
              },
            ]
          : []),
        ...(!inUse && device.id !== deviceId
          ? [
              {
                text: i18n.t('calendarRemoveDevice'),
                style: 'destructive' as const,
                onPress: () => run(() => removeDevice(device.id)),
              },
            ]
          : []),
      ]
    )
  }
  const sublabel = (device: CalendarDevice) =>
    [
      device.id === deviceId ? i18n.t('iCloudThisDevice') : null,
      device.seen
        ? i18n.t('calendarDeviceSeen', {
            when: formatRelative(device.seen * 1000),
          })
        : null,
    ]
      .filter(Boolean)
      .join(' · ') || undefined
  return (
    <View style={{ gap: 8 }}>
      <View>
        <SectionTitle
          text={i18n.t('calendarPrimaryDevice')}
          info={i18n.t('calendarPrimaryDescription')}
        />
        <Section>
          {state?.devices.map((device) => (
            <InputRowButton
              key={device.id}
              label={device.name}
              sublabel={sublabel(device)}
              disabled={working}
              onPress={() => choose(device)}
            >
              <Text style={{ color: theme.colors.textAlt }}>
                {device.id === state.primary
                  ? i18n.t('calendarPrimarySelected')
                  : device.id === state.pending
                    ? i18n.t('calendarPrimaryPending')
                    : ''}
              </Text>
            </InputRowButton>
          ))}
          <InputRowButton
            label={i18n.t('calendarRefreshDevices')}
            disabled={working}
            onPress={() => run(refreshPublishing)}
            lastInSection
          />
        </Section>
      </View>
      {!!state?.pending && (
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.textAlt,
            paddingHorizontal: inputLayout.horizontalPadding,
          }}
        >
          {i18n.t('calendarHandoffPending')}
        </Text>
      )}
    </View>
  )
}
