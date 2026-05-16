import { Pressable, TextInput as RNTextInput, View } from 'react-native'
import useTheme from '@/contexts/theme'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { publishers } from '@/constants/publisher'
import Select, { SelectData } from '@/components/ui/Select'
import TextInput from '@/components/ui/TextInput'
import { Publisher } from '@/types/publisher'
import { useRef, useState } from 'react'

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

  const { publisherHours, role, setRole, set } = usePreferences()
  const [goalHours, setGoalHours] = useState(publisherHours.custom.toString())
  const customHoursInput = useRef<RNTextInput>(null)

  return (
    <View>
      <Select
        data={items}
        onChange={({ value }) => setRole(value)}
        value={role}
        style={{ marginBottom: 10 }}
      />

      {role === 'custom' ? (
        <View>
          <Pressable
            onPress={() => customHoursInput.current?.focus()}
            hitSlop={{ top: 8, bottom: 8 }}
            accessibilityRole='button'
            accessibilityLabel={i18n.t('customHourRequirement')}
          >
            <Text
              style={{
                fontSize: 12,
                color: theme.colors.textAlt,
              }}
            >
              {i18n.t('customHourRequirement')}
            </Text>
          </Pressable>
          <TextInput
            ref={customHoursInput}
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
            maxLength={5}
            placeholder={publisherHours.custom.toString()}
            onChangeText={(val: string) => setGoalHours(val)}
            onBlur={() => {
              if (goalHours) {
                set({
                  publisherHours: {
                    ...publisherHours,
                    custom: parseFloat(goalHours) ?? 0,
                  },
                })
              }
            }}
            value={goalHours.toString()}
            keyboardType='decimal-pad'
          />
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: theme.colors.textAlt }}>
          {role === publishers[0]
            ? i18n.t('noHourRequirement')
            : i18n.t('hourMonthlyRequirement', {
                count: publisherHours[role],
              })}
        </Text>
      )}
    </View>
  )
}
export default PublisherTypeSelector
