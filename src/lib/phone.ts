import { Alert, Linking } from 'react-native'
import i18n from './locales'
import { RootStackNavigation } from '../stacks/RootStack'
import { ParsedPhoneNumber } from 'awesome-phonenumber'
import { Contact } from '../types/contact'

const alertInvalidPhone = (
  contact: Contact,
  navigation: RootStackNavigation,
  formatted: ParsedPhoneNumber
) => {
  Alert.alert(
    i18n.t('invalidPhone'),
    `"${formatted.number?.input}" ${i18n.t('invalidPhone_description')} ${
      formatted.regionCode
    }.`,
    [
      { style: 'cancel', text: i18n.t('cancel') },
      {
        style: 'default',
        text: i18n.t('edit'),
        onPress: () =>
          navigation.replace('Contact Form', {
            id: contact.id,
            edit: true,
          }),
      },
    ]
  )
}
export const handleCall = (
  contact: Contact,
  formatted: ParsedPhoneNumber,
  navigation: RootStackNavigation
) => {
  const isValid = formatted.valid

  if (isValid) {
    Linking.openURL(`tel:${formatted.number.e164}`)
  } else alertInvalidPhone(contact, navigation, formatted)
}

export const handleMessage = (
  contact: Contact,
  formatted: ParsedPhoneNumber,
  navigation: RootStackNavigation
) => {
  const isValid = formatted.valid

  if (isValid) {
    Linking.openURL(`sms:${formatted.number.e164}`)
  } else alertInvalidPhone(contact, navigation, formatted)
}
