import PhoneInput, {
  ICountry,
  ITheme,
  getCountryByCca2,
} from 'react-native-international-phone-number'
import { ICountryCca2 } from 'react-native-international-phone-number/lib/interfaces/countryCca2'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { parsePhoneNumber } from 'awesome-phonenumber'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Divider from '@/components/ui/Divider'
import { Contact } from '@/types/contact'
import { Alert, TextInput, useColorScheme, View } from 'react-native'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import useContacts from '@/stores/contactsStore'
import { useMemo, useRef, useState } from 'react'
import * as Localization from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import IconButton from '@/components/ui/IconButton'
import { faCaretDown, faMinus } from '@fortawesome/free-solid-svg-icons'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { RootStackNavigation } from '@/types/rootStack'

export default function PersonalContactSection({
  contact,
  emailInput,
  setPhone,
  setRegionCode,
  setEmail,
  customFields,
  setCustomField,
  clearCustomField,
}: {
  contact: Contact
  emailInput: React.RefObject<TextInput | null>
  setPhone: (phone: string) => void
  setRegionCode: (regionCode: string) => void
  setEmail: (email: string) => void
  customFields?: Record<string, string>
  setCustomField: (key: string, value: string) => void
  clearCustomField: (key: string) => void
}) {
  const { customFieldDefs, addCustomFieldDef, archiveCustomFieldDef } =
    useContacts()
  const navigation = useNavigation<RootStackNavigation>()
  const placeholder = useRef(contact.phone || '')
  const locales = Localization.getLocales()
  const [customFieldName, setCustomFieldName] = useState('')
  const colorScheme = useColorScheme()
  const theme = useTheme()

  // Sorted, non-archived defs are the only ones the user sees on the form.
  // Archived defs are hidden everywhere by design — restore from the manage
  // screen if the user wants their data back.
  const visibleDefs = useMemo(
    () =>
      [...customFieldDefs]
        .filter((d) => !d.archived)
        .sort((a, b) => a.order - b.order),
    [customFieldDefs]
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

  const handleAddNewCustomField = () => {
    addCustomFieldDef(customFieldName)
    setCustomFieldName('')
  }

  const handleDeletePrompt = (defId: string) => {
    Alert.alert(i18n.t('delete'), i18n.t('deleteField_description'), [
      {
        text: i18n.t('cancel'),
        style: 'cancel',
        onPress: () => {},
      },
      {
        text: i18n.t('clearForThisContact'),
        onPress: () => clearCustomField(defId),
      },
      {
        // Archive (soft-delete): hides the field everywhere but preserves
        // every contact's value in storage. The user can restore from the
        // management screen.
        text: i18n.t('archiveField'),
        style: 'destructive',
        onPress: () => archiveCustomFieldDef(defId),
      },
    ])
  }

  const hasManage =
    visibleDefs.length > 0 || customFieldDefs.some((d) => d.archived)

  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 8 }}>
        <XView
          style={{
            paddingLeft: 25,
            paddingRight: 20,
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
            {i18n.t('customFields')}
          </Text>
          {hasManage && (
            <Button
              onPress={() => navigation.navigate('PreferencesCustomFields')}
            >
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.textAlt,
                  textDecorationLine: 'underline',
                }}
              >
                {i18n.t('manageCustomFields')}
              </Text>
            </Button>
          )}
        </XView>

        <Section>
          {visibleDefs.map((def, index) => {
            const isLast = index === visibleDefs.length - 1
            return (
              <XView key={def.id}>
                <IconButton
                  icon={faMinus}
                  color={theme.colors.error}
                  onPress={() => handleDeletePrompt(def.id)}
                  style={{ paddingBottom: isLast ? 0 : 15 }}
                />
                <TextInputRow
                  label={def.label}
                  style={{ flex: 1 }}
                  textInputProps={{
                    placeholder: `${i18n.t('goesHere')}`,
                    onChangeText: (val: string) => {
                      setCustomField(def.id, val)
                    },
                    value: customFields?.[def.id] ?? '',
                    autoCapitalize: 'words',
                  }}
                  lastInSection={isLast}
                />
              </XView>
            )
          })}
          {visibleDefs.length > 0 && (
            <Divider marginVertical={4} marginHorizontal={-3} />
          )}
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
      </View>

      <Section>
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
            keyboardType: 'email-address',
            onChangeText: (val: string) => setEmail(val),
            value: contact.email,
            autoCapitalize: 'none',
          }}
          lastInSection
        />
      </Section>
    </View>
  )
}
