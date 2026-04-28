import { Switch, View } from 'react-native'
import Text from '../../../../components/MyText'
import useTheme from '../../../../contexts/theme'
import i18n, { TranslationKey } from '../../../../lib/locales'
import Section from '../../../../components/inputs/Section'
import InputRowContainer from '../../../../components/inputs/InputRowContainer'
import Select from '../../../../components/Select'
import { usePreferences } from '../../../../stores/preferences'

const PlansPreferencesSection = () => {
  const theme = useTheme()
  const { planNotificationOffset, planAlwaysNotify, set } = usePreferences()

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
            <Text
              style={{
                fontFamily: theme.fonts.semiBold,
                flexDirection: 'column',
                gap: 10,
              }}
            >
              {i18n.t('notificationOffset')}
            </Text>
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value }) =>
                  set({
                    planNotificationOffset: {
                      ...planNotificationOffset,
                      amount: value,
                    },
                  })
                }
                value={planNotificationOffset?.amount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    planNotificationOffset: {
                      ...planNotificationOffset,
                      unit: value,
                    },
                  })
                }
                value={planNotificationOffset?.unit}
              />
            </View>
            <Text style={{ color: theme.colors.textAlt }}>
              {i18n.t('before')}
            </Text>
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('planNotificationOffset_description')}
          </Text>
        </InputRowContainer>
        <InputRowContainer
          lastInSection
          label={i18n.t('planAlwaysNotify')}
          style={{ justifyContent: 'space-between' }}
        >
          <Switch
            value={planAlwaysNotify}
            onValueChange={(value) => set({ planAlwaysNotify: value })}
          />
        </InputRowContainer>
      </Section>
    </View>
  )
}

export default PlansPreferencesSection
