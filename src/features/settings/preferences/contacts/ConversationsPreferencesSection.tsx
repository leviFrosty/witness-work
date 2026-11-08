import { View } from 'react-native'
import i18n, { TranslationKey } from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import InputRowSwitch from '@/components/ui/inputs/InputRowSwitch'
import Select from '@/components/ui/Select'
import {
  DEFAULT_RETURN_VISIT_TIME_OFFSET,
  usePreferences,
} from '@/stores/preferences'
import SettingsSearchTarget from '@/features/settings/components/search/SettingsSearchTarget'

const ConversationsPreferencesSection = () => {
  const { returnVisitTimeOffset, prefillAddress, set } = usePreferences()

  const currentTimeAmount =
    returnVisitTimeOffset?.amount ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.amount
  const currentTimeUnit =
    returnVisitTimeOffset?.unit ?? DEFAULT_RETURN_VISIT_TIME_OFFSET.unit

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
        <SettingsSearchTarget id='followUpOffset'>
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
        </SettingsSearchTarget>

        <SettingsSearchTarget id='autoFillAddress'>
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
        </SettingsSearchTarget>
      </Section>
    </View>
  )
}
export default ConversationsPreferencesSection
