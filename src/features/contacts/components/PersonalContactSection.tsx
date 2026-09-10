import { getContactInformationFields } from '@/lib/contactInformationFields'
import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import PhoneInput, {
  ICountry,
  ITheme,
  getCountryByCca2,
} from 'react-native-international-phone-number'
import { ICountryCca2 } from 'react-native-international-phone-number/lib/interfaces/countryCca2'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { parsePhoneNumber } from 'awesome-phonenumber'
import Button from '@/components/ui/Button'
import { Contact } from '@/types/contact'
import { TextInput, useColorScheme, View } from 'react-native'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useContacts from '@/stores/contactsStore'
import { useMemo, useRef } from 'react'
import * as Localization from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { RootStackNavigation } from '@/types/rootStack'
import { usePreferences } from '@/stores/preferences'

export default function PersonalContactSection({
  contact,
  emailInput,
  setPhone,
  setRegionCode,
  setEmail,
  customFields,
  setCustomField,
}: {
  contact: Contact
  emailInput: React.RefObject<TextInput | null>
  setPhone: (phone: string) => void
  setRegionCode: (regionCode: string) => void
  setEmail: (email: string) => void
  customFields?: Record<string, string>
  setCustomField: (key: string, value: string) => void
}) {
  const { customFieldDefs } = useContacts()
  const navigation = useNavigation<RootStackNavigation>()
  const placeholder = useRef(contact.phone || '')
  const locales = Localization.getLocales()
  const colorScheme = useColorScheme()
  const {
    colorScheme: preferredColorScheme,
    contactInformationOrder,
    showContactPhone,
    showContactEmail,
  } = usePreferences()
  const theme = useTheme()
  const phoneTheme = (preferredColorScheme ?? colorScheme ?? 'light') as ITheme

  const visibleFields = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder,
    {
      phone: showContactPhone,
      email: showContactEmail,
    }
  )

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

  const openCustomFieldManager = () =>
    navigation.navigate('PreferencesCustomFields')

  return (
    <View style={{ gap: 8 }}>
      <XView
        style={{
          paddingHorizontal: 12,
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Text
          style={{
            fontSize: 11,
            color: theme.colors.textAlt,
            letterSpacing: 1.4,
            fontFamily: theme.fonts.semiBold,
            textTransform: 'uppercase',
          }}
        >
          {i18n.t('information')}
        </Text>
        <Button onPress={openCustomFieldManager}>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.textAlt,
              textDecorationLine: 'underline',
            }}
          >
            {i18n.t('manageContactFields')}
          </Text>
        </Button>
      </XView>
      {visibleFields.length > 0 && (
        <Section>
          {visibleFields.map((field, index) => {
            const last = index === visibleFields.length - 1
            if (field.kind === 'phone')
              return (
                <InputRowContainer key={field.id} lastInSection={last}>
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
                      theme={phoneTheme}
                      inputMode='numeric'
                      clearButtonMode='while-editing'
                      customCaret={<IconButton icon={ChevronDownIcon} />}
                      phoneInputStyles={{
                        container: {
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.numbers.borderRadiusMd,
                          backgroundColor: theme.colors.background,
                          minHeight: 44,
                          overflow: 'hidden',
                        },
                        flagContainer: {
                          backgroundColor: theme.colors.card,
                          borderRadius: theme.numbers.borderRadiusSm,
                          paddingHorizontal: 10,
                          minWidth: 88,
                        },
                        input: {
                          fontSize: theme.fontSize('lg'),
                          textAlign: 'left',
                          paddingHorizontal: 10,
                          color: theme.colors.text,
                        },
                        callingCode: {
                          fontSize: theme.fontSize('md'),
                          color: theme.colors.text,
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
              )
            if (field.kind === 'email')
              return (
                <TextInputRow
                  key={field.id}
                  label={i18n.t('email')}
                  ref={emailInput}
                  controlWidth='auto'
                  controlStyle={{ width: '76%', minWidth: 0 }}
                  textInputProps={{
                    placeholder: i18n.t('email_placeholder'),
                    type: 'email',
                    onChangeText: (val: string) => setEmail(val),
                    value: contact.email,
                    autoCapitalize: 'none',
                    textAlign: 'left',
                  }}
                  lastInSection={last}
                />
              )
            if (field.kind !== 'custom') return null
            const def = field.definition
            return (
              <TextInputRow
                key={field.id}
                label={def.label}
                controlWidth='full'
                textInputProps={{
                  placeholder: i18n.t('goesHere'),
                  onChangeText: (value: string) => {
                    setCustomField(def.id, value)
                  },
                  value: customFields?.[def.id] ?? '',
                  autoCapitalize: 'words',
                  textAlign: 'left',
                }}
                lastInSection={last}
              />
            )
          })}
        </Section>
      )}
    </View>
  )
}
