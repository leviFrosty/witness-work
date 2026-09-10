import { View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Select from '@/components/ui/Select'
import {
  DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET,
  DEFAULT_RETURN_VISIT_TIME_OFFSET,
  usePreferences,
} from '@/stores/preferences'

const ConversationsPreferencesSection = () => {
  const theme = useTheme()
  const {
    returnVisitTimeOffset,
    returnVisitNotificationOffset,
    returnVisitAlwaysNotify,
    prefillAddress,
    set,
  } = usePreferences()

  const currentTimeAmount =
    returnVisitTimeOffset?.amount ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.amount
  const currentTimeUnit =
    returnVisitTimeOffset?.unit ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.unit
  const currentNotifAmount =
    returnVisitNotificationOffset?.amount ??
    DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.amount
  const currentNotifUnit =
    returnVisitNotificationOffset?.unit ??
    DEFAULT_RETURN_VISIT_NOTIFICATION_OFFSET.unit

  const amountOptions = [...Array(1000).keys()].map((value) => ({
    label: `${value}`,
    value,
  }))

  const unitOptions: {
    label: string
    value: moment.unitOfTime.DurationConstructor
  }[] = ['minutes', 'hours', 'days', 'weeks'].map((value) => ({
    label: i18n.t(`${value}_lowercase` as TranslationKey),
    value: value as moment.unitOfTime.DurationConstructor,
  }))

  return (
    <View style={{ gap: 3 }}>
      <Section>
        <InputRowContainer
          label={i18n.t('followUpOffset')}
          description={i18n.t('nextVisitOffset_description')}
          controlWidth='full'
          style={{
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitTimeOffset: {
                      amount: value,
                      unit: currentTimeUnit,
                    },
                  })
                }
                value={currentTimeAmount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitTimeOffset: {
                      amount: currentTimeAmount,
                      unit: value,
                    },
                  })
                }
                value={currentTimeUnit}
              />
            </View>
          </View>
        </InputRowContainer>

        <InputRowContainer
          label={i18n.t('notificationOffset')}
          description={i18n.t('notificationOffset_description')}
          controlWidth='full'
          lastInSection
          style={{
            flexDirection: 'column',
            gap: 10,
            alignItems: 'flex-start',
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitNotificationOffset: {
                      amount: value,
                      unit: currentNotifUnit,
                    },
                  })
                }
                value={currentNotifAmount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitNotificationOffset: {
                      amount: currentNotifAmount,
                      unit: value,
                    },
                  })
                }
                value={currentNotifUnit}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('before')}
            </Text>
          </View>
        </InputRowContainer>
        <InputRowSwitch
          label={i18n.t('alwaysNotify')}
          value={returnVisitAlwaysNotify}
          onValueChange={(value) => set({ returnVisitAlwaysNotify: value })}
        />
        <InputRowSwitch
          label={i18n.t('autoFillAddressFromLastContact')}
          info={i18n.t('autoFillAddressFromLastContact_description')}
          lastInSection
          value={prefillAddress.enabled}
          onValueChange={(value) =>
            set({
              prefillAddress: {
                ...prefillAddress,
                enabled: value,
              },
            })
          }
        />
      </Section>
    </View>
  )
}
export default ConversationsPreferencesSection
