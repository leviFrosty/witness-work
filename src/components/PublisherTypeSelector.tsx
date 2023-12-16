import { View } from 'react-native'
import useTheme from '../contexts/theme'
import Text from './MyText'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import { publishers } from '../constants/publisher'
import Select, { SelectData } from './Select'
import TextInput from './TextInput'
import { Publisher } from '../types/publisher'

const PublisherTypeSelector = () => {
  const theme = useTheme()
  const items: SelectData<Publisher> = [
    {
      label: i18n.t('publisher'),
      value: publishers[0],
    },
    {
      label: i18n.t('regularAuxiliary'),
      value: publishers[1],
    },
    {
      label: i18n.t('regularPioneer'),
      value: publishers[2],
    },
    {
      label: i18n.t('circuitOverseer'),
      value: publishers[3],
    },
    {
      label: i18n.t('specialPioneer'),
      value: publishers[4],
    },
    {
      label: i18n.t('custom'),
      value: publishers[5],
    },
  ]

  const { publisherHours, publisher, setPublisher, set } = usePreferences()

  return (
    <View>
      <Select
        data={items}
        onChange={({ value }) => setPublisher(value)}
        value={publisher}
        style={{ marginBottom: 10 }}
      />

      {publisher === 'custom' ? (
        <View>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
            }}
          >
            {i18n.t('customHourRequirement')}
          </Text>
          <TextInput
            textAlign='left'
            style={{
              marginVertical: 5,
              borderColor: theme.colors.border,
              borderWidth: 1,
              borderRadius: theme.numbers.borderRadiusSm,
              paddingVertical: 5,
              paddingHorizontal: 10,
              color: theme.colors.text,
            }}
            maxLength={3}
            placeholder={publisherHours.custom.toString()}
            onChangeText={(val: string) =>
              set({
                publisherHours: {
                  ...publisherHours,
                  custom: val ? parseInt(val) : 0,
                },
              })
            }
            value={publisherHours.custom.toString()}
            keyboardType='number-pad'
          />
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {publisher === publishers[0]
            ? i18n.t('noHourRequirement')
            : i18n.t('hourMonthlyRequirement', {
                count: publisherHours[publisher],
              })}
        </Text>
      )}
    </View>
  )
}
export default PublisherTypeSelector
