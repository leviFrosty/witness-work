import PhoneInput, {
  ICountry,
  ITheme,
  getCountryByCca2,
} from 'react-native-international-phone-number'
import { ICountryCca2 } from 'react-native-international-phone-number/lib/interfaces/countryCca2'
import InputRowContainer from '../components/inputs/InputRowContainer'
import { parsePhoneNumber } from 'awesome-phonenumber'
import ActionButton from '../components/ActionButton'
import { Contact } from '../types/contact'
import { Alert, TextInput, useColorScheme, View } from 'react-native'
import TextInputRow, { Errors } from './inputs/TextInputRow'
import { usePreferences } from '../stores/preferences'
import useContacts from '../stores/contactsStore'
import { useMemo, useRef, useState } from 'react'
import * as Localization from 'expo-localization'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Section from './inputs/Section'
import IconButton from './IconButton'
import { faCaretDown, faMinus } from '@fortawesome/free-solid-svg-icons'
import Text from './MyText'
import XView from './layout/XView'

export default function PersonalContactSection({
  contact,
  nameInput,
  setName,
  emailInput,
  setPhone,
  setRegionCode,
  line1Input,
  setEmail,
  setErrors,
  errors,
  customFields,
  setCustomField,
  clearCustomField,
}: {
  contact: Contact
  nameInput: React.RefObject<TextInput>
  setName: (name: string) => void
  emailInput: React.RefObject<TextInput>
  setPhone: (phone: string) => void
  setRegionCode: (regionCode: string) => void
  line1Input: React.RefObject<TextInput>
  setEmail: (email: string) => void
  errors: Errors
  setErrors: React.Dispatch<React.SetStateAction<Errors>>
  customFields?: Record<string, string>
  setCustomField: (key: string, value: string) => void
  clearCustomField: (key: string) => void
}) {
  const { customContactFields, set } = usePreferences()
  const { deleteFieldFromAllContacts } = useContacts()
  const placeholder = useRef(contact.phone || '')
  const locales = Localization.getLocales()
  const [customFieldName, setCustomFieldName] = useState('')
  const colorScheme = useColorScheme()
  const theme = useTheme()

  const handleCountryChange = (country: ICountry) => {
    if (!country) {
      return // Library has some very weird edge-case where it sometimes doesn't return a country.
    }
    setRegionCode(country.cca2)
  }

  const country = useMemo(
    () => getCountryByCca2(contact.phoneRegionCode || 'US'),
    [contact.phoneRegionCode]
  )

  const formatted = useMemo(
    () =>
      parsePhoneNumber(placeholder.current, {
        regionCode: contact.phoneRegionCode || locales[0].regionCode || '',
      }),
    [contact.phoneRegionCode, locales]
  )

  const defaultValue = useMemo(
    () =>
      formatted.regionCode && formatted.valid
        ? formatted.number?.e164
        : undefined,
    [formatted.number?.e164, formatted.regionCode, formatted.valid]
  )

  const handleAddNewCustomField = () => {
    set({
      customContactFields: [...customContactFields, customFieldName],
    })
    setCustomFieldName('')
  }

  const handleDeletePrompt = (field: string) => {
    Alert.alert(i18n.t('delete'), i18n.t('deleteField_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
        onPress: () => {},
      },
      {
        text: i18n.t('clearForThisContact'),
        onPress: () => handleClearCustomFieldForContact(field),
      },
      {
        text: i18n.t('deleteFieldOnAllContacts'),
        style: 'destructive',
        onPress: () => handleDeleteCustomFieldAcrossAllContacts(field),
      },
    ])
  }

  const handleDeleteCustomFieldAcrossAllContacts = (field: string) => {
    set({
      customContactFields: customContactFields.filter((f) => f !== field),
    })
    deleteFieldFromAllContacts(field)
  }

  const handleClearCustomFieldForContact = (field: string) => {
    clearCustomField(field)
  }

  return (
    <Section>
      <TextInputRow
        errors={errors}
        setErrors={setErrors}
        id='name'
        label={i18n.t('name')}
        ref={nameInput}
        textInputProps={{
          placeholder: i18n.t('name_placeholder'),
          onChangeText: (val: string) => setName(val),
          value: contact.name,
          autoCapitalize: 'words',
          autoCorrect: false,
        }}
        required
      />
      <InputRowContainer>
        <View style={{ flex: 1 }}>
          <PhoneInput
            hitSlop={{ top: 15, bottom: 15 }}
            value={contact.phone || ''}
            defaultValue={defaultValue}
            onChangePhoneNumber={(phone: string) => setPhone(phone)}
            defaultCountry={locales[0].regionCode as ICountryCca2}
            selectedCountry={country}
            placeholder={i18n.t('phone_placeholder')}
            placeholderTextColor={theme.colors.textAlt}
            popularCountries={['US', 'KR', 'BR', 'JP', 'MX', 'CA']}
            onChangeSelectedCountry={handleCountryChange}
            theme={colorScheme as ITheme}
            inputMode='numeric'
            clearButtonMode='while-editing'
            customCaret={<IconButton icon={faCaretDown} />}
            phoneInputStyles={{
              container: {
                borderWidth: 0,
                backgroundColor: theme.colors.backgroundLighter,
              },
              flagContainer: {
                backgroundColor: theme.colors.card,
                borderRadius: theme.numbers.borderRadiusSm,
              },
              input: {
                fontSize: theme.fontSize('md'),
                textAlign: 'right',
                paddingHorizontal: 2,
              },
              callingCode: {
                fontSize: theme.fontSize('md'),
              },
              divider: {
                backgroundColor: theme.colors.border,
              },
              caret: {
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              },
            }}
            modalStyles={{
              modal: {
                backgroundColor: theme.colors.background,
              },
              searchInput: {
                borderColor: theme.colors.border,
              },
              countryButton: {
                borderColor: theme.colors.border,
                backgroundColor: theme.colors.card,
                shadowColor: theme.colors.shadow,
                shadowOffset: { height: 1, width: 0 },
                shadowOpacity: theme.numbers.shadowOpacity,
              },
            }}
          />
          {placeholder.current.length > 0 && !formatted.possible && (
            <Text
              style={{
                textAlign: 'right',
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
              }}
            >{`"${formatted.number?.input}" ${i18n.t('error')}: ${
              formatted.possibility
            }`}</Text>
          )}
        </View>
      </InputRowContainer>
      <TextInputRow
        label={i18n.t('email')}
        ref={emailInput}
        textInputProps={{
          placeholder: i18n.t('email_placeholder'),
          onSubmitEditing: () => line1Input.current?.focus(),
          keyboardType: 'email-address',
          onChangeText: (val: string) => setEmail(val),
          value: contact.email,
          autoCapitalize: 'none',
        }}
      />
      {!!customContactFields.length &&
        customFields &&
        customContactFields.map((field) => (
          <XView key={field}>
            <IconButton
              icon={faMinus}
              color={theme.colors.error}
              onPress={() => handleDeletePrompt(field)}
              style={{ paddingBottom: 15 }}
            />
            <TextInputRow
              label={field}
              style={{ flex: 1 }}
              textInputProps={{
                placeholder: `${i18n.t('goesHere')}`,
                onChangeText: (val: string) => {
                  setCustomField(field, val)
                },
                value: customFields[field],
                autoCapitalize: 'words',
              }}
            />
          </XView>
        ))}
      <XView style={{ paddingRight: 20 }}>
        <TextInputRow
          label={i18n.t('customField')}
          textInputProps={{
            onChangeText: (val: string) => {
              setCustomFieldName(val)
            },
            placeholder: i18n.t('customField_placeholder'),
            value: customFieldName,
            autoCapitalize: 'words',
            maxLength: 14,
          }}
          style={{ flex: 1 }}
          lastInSection
        />
        <ActionButton
          disabled={!customFieldName.length}
          onPress={handleAddNewCustomField}
        >
          <Text style={{ color: theme.colors.textInverse }}>
            {i18n.t('add')}
          </Text>
        </ActionButton>
      </XView>
    </Section>
  )
}
