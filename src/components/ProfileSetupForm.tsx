import { View } from 'react-native'
import TextInput from './TextInput'
import DateTimePicker from './DateTimePicker'
import Text from './MyText'
import i18n from '../lib/locales'
import useTheme from '../contexts/theme'
import { usePreferences } from '../stores/preferences'
import { Publisher } from '../types/publisher'
import AvatarPicker from './AvatarPicker'

const PIONEER_PUBLISHERS: Publisher[] = [
  'regularPioneer',
  'specialPioneer',
  'circuitOverseer',
]

export const isPioneer = (publisher: Publisher) =>
  PIONEER_PUBLISHERS.includes(publisher)

const ProfileSetupForm = () => {
  const theme = useTheme()
  const { name, pioneerStartDate, publisher, set } = usePreferences()

  return (
    <View style={{ gap: 16 }}>
      <AvatarPicker />
      <View>
        <Text
          style={{
            fontFamily: theme.fonts.semiBold,
            marginBottom: 6,
            color: theme.colors.text,
          }}
        >
          {i18n.t('firstName')}
        </Text>
        <TextInput
          textAlign='left'
          style={{
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.numbers.borderRadiusSm,
            paddingVertical: 10,
            paddingHorizontal: 12,
            color: theme.colors.text,
            fontSize: 16,
            backgroundColor: theme.colors.card,
          }}
          placeholder={i18n.t('firstNamePlaceholder')}
          value={name}
          onChangeText={(val: string) => set({ name: val })}
          autoCapitalize='words'
          autoCorrect={false}
          maxLength={40}
          returnKeyType='done'
        />
      </View>
      {isPioneer(publisher) && (
        <View>
          <Text
            style={{
              fontFamily: theme.fonts.semiBold,
              marginBottom: 6,
              color: theme.colors.text,
            }}
          >
            {i18n.t('pioneerStartDate')}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              marginBottom: 8,
            }}
          >
            {i18n.t('pioneerStartDate_description')}
          </Text>
          <DateTimePicker
            value={pioneerStartDate ? new Date(pioneerStartDate) : new Date()}
            onChange={(_e, date) => {
              if (date) set({ pioneerStartDate: date })
            }}
            maximumDate={new Date()}
            iOSMode='date'
            androidFirstPickerMode='date'
          />
        </View>
      )}
    </View>
  )
}

export default ProfileSetupForm
