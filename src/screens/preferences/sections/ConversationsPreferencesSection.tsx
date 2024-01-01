import { Switch, View } from 'react-native'
import Text from '../../../components/MyText'
import useTheme from '../../../contexts/theme'
import i18n, { TranslationKey } from '../../../lib/locales'
import Section from '../../../components/inputs/Section'
import InputRowContainer from '../../../components/inputs/InputRowContainer'
import Select from '../../../components/Select'
import { usePreferences } from '../../../stores/preferences'
import SettingsSectionTitle from '../../settings/shared/SettingsSectionTitle'

const ConversationsPreferencesSection = () => {
  const theme = useTheme()
  const {
    returnVisitTimeOffset,
    returnVisitNotificationOffset,
    returnVisitAlwaysNotify,
    set,
  } = usePreferences()

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
      <SettingsSectionTitle text={i18n.t('conversations')} />
      <Section>
        <InputRowContainer
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
              {i18n.t('followUpOffset')}
            </Text>
            <View style={{ flex: 1 }}>
              <Select
                data={amountOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitTimeOffset: {
                      ...returnVisitTimeOffset,
                      amount: value,
                    },
                  })
                }
                value={returnVisitTimeOffset?.amount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitTimeOffset: {
                      ...returnVisitTimeOffset,
                      unit: value,
                    },
                  })
                }
                value={returnVisitTimeOffset?.unit}
              />
            </View>
          </View>
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('nextVisitOffset_description')}
          </Text>
        </InputRowContainer>

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
                    returnVisitNotificationOffset: {
                      ...returnVisitNotificationOffset,
                      amount: value,
                    },
                  })
                }
                value={returnVisitNotificationOffset?.amount}
              />
            </View>

            <View style={{ flex: 1 }}>
              <Select
                data={unitOptions}
                onChange={({ value }) =>
                  set({
                    returnVisitNotificationOffset: {
                      ...returnVisitNotificationOffset,
                      unit: value,
                    },
                  })
                }
                value={returnVisitNotificationOffset?.unit}
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
            {i18n.t('notificationOffset_description')}
          </Text>
        </InputRowContainer>
        <InputRowContainer
          lastInSection
          label={i18n.t('alwaysNotify')}
          style={{ justifyContent: 'space-between' }}
        >
          <Switch
            value={returnVisitAlwaysNotify}
            onValueChange={(value) => set({ returnVisitAlwaysNotify: value })}
          />
        </InputRowContainer>
      </Section>
    </View>
  )
}
export default ConversationsPreferencesSection
