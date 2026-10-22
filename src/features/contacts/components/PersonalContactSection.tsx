import CustomFieldPrivacyWarning from '@/components/CustomFieldPrivacyWarning'
import {
  type ContactInformationField,
  nextKeyboardField,
} from '@/lib/contactInformationFields'
import { ChevronDown as ChevronDownIcon } from 'lucide-react-native'
import PhoneInput, {
  ICountry,
  ITheme,
  getCountryByCca2,
} from 'react-native-international-phone-number'
import { ICountryCca2 } from 'react-native-international-phone-number/lib/interfaces/countryCca2'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { parsePhoneNumber, PhoneNumberPossibility } from 'awesome-phonenumber'
import Button from '@/components/ui/Button'
import { Contact } from '@/types/contact'
import {
  TextInput,
  useColorScheme,
  useWindowDimensions,
  View,
} from 'react-native'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import { type Ref, useImperativeHandle, useMemo, useRef } from 'react'
import * as Localization from 'expo-localization'
import { useNavigation } from '@react-navigation/native'
import useTheme from '@/contexts/theme'
import i18n, { TranslationKey } from '@/lib/locales'
import Section from '@/components/ui/inputs/Section'
import IconButton from '@/components/ui/IconButton'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import { RootStackNavigation } from '@/types/rootStack'
import { usePreferences } from '@/stores/preferences'
import { alignInput, alignText, ltrIsolate } from '@/lib/direction'
import { tracking } from '@/lib/tracking'
import useAccessibilityTextSize from '@/hooks/useAccessibilityTextSize'

const phoneIssueKeys = {
  'is-possible': 'phoneIssue_invalid',
  invalid: 'phoneIssue_invalid',
  'invalid-country-code': 'phoneIssue_invalidCountryCode',
  'too-long': 'phoneIssue_tooLong',
  'too-short': 'phoneIssue_tooShort',
  unknown: 'phoneIssue_unknown',
} as const satisfies Record<PhoneNumberPossibility, TranslationKey>

export type PersonalContactSectionHandle = {
  /** Moves the keyboard to the first field it can focus. */
  focusFirst: () => void
}

export default function PersonalContactSection({
  contact,
  fields,
  ref,
  setPhone,
  setRegionCode,
  setEmail,
  customFields,
  setCustomField,
}: {
  contact: Contact
  /** Phone, email and custom fields, in the order and visibility to show. */
  fields: ContactInformationField[]
  ref?: Ref<PersonalContactSectionHandle>
  setPhone: (phone: string) => void
  setRegionCode: (regionCode: string) => void
  setEmail: (email: string) => void
  customFields?: Record<string, string>
  setCustomField: (key: string, value: string) => void
}) {
  const navigation = useNavigation<RootStackNavigation>()
  const placeholder = useRef(contact.phone || '')
  const locales = Localization.getLocales()
  const colorScheme = useColorScheme()
  const { colorScheme: preferredColorScheme } = usePreferences()
  const theme = useTheme()
  /** Each field's text input by field id, for the keyboard's Next key. */
  const inputs = useRef<Record<string, TextInput | null>>({})
  const phoneTheme = (preferredColorScheme ?? colorScheme ?? 'light') as ITheme
  // The phone library fixes its field at 48 pt on one line, which cuts the
  // placeholder off with enlarged text. There it wraps and the field grows.
  const wrapPhone = useWindowDimensions().fontScale > 1
  const largeText = useAccessibilityTextSize()

  const focusAfter = (index: number) => {
    const next = nextKeyboardField(fields, index)
    if (next) inputs.current[next.id]?.focus()
  }

  useImperativeHandle(ref, () => ({ focusFirst: () => focusAfter(-1) }))

  /**
   * Return-key props that move the keyboard to the next field, or close it with
   * Done after the last one. A field that wraps never takes a line break.
   */
  const keyboardProps = (index: number) => {
    const next = nextKeyboardField(fields, index)
    return next
      ? {
          enterKeyHint: 'next' as const,
          submitBehavior: 'submit' as const,
          onSubmitEditing: () => focusAfter(index),
        }
      : {
          enterKeyHint: 'done' as const,
          submitBehavior: 'blurAndSubmit' as const,
        }
  }

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
            letterSpacing: tracking(1.4),
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
      {fields.length > 0 && (
        <Section>
          {fields.map((field, index) => {
            const last = index === fields.length - 1
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
                      multiline={wrapPhone}
                      {...keyboardProps(index)}
                      customCaret={<IconButton icon={ChevronDownIcon} />}
                      phoneInputStyles={{
                        container: {
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          borderRadius: theme.numbers.borderRadiusMd,
                          backgroundColor: theme.colors.background,
                          minHeight: 44,
                          overflow: 'hidden',
                          ...(wrapPhone && { height: 'auto', minHeight: 48 }),
                        },
                        flagContainer: {
                          backgroundColor: theme.colors.card,
                          borderRadius: theme.numbers.borderRadiusSm,
                          paddingHorizontal: 10,
                          minWidth: 88,
                          ...(wrapPhone && {
                            height: 'auto',
                            alignSelf: 'stretch',
                          }),
                        },
                        input: {
                          fontSize: theme.fontSize('lg'),
                          // The library's input is a plain TextInput. A phone
                          // number keeps its left-to-right order in RTL.
                          textAlign: alignInput('start'),
                          direction: 'ltr',
                          paddingHorizontal: 10,
                          color: theme.colors.text,
                        },
                        callingCode: {
                          direction: 'ltr',
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
                          textAlign: alignText('end'),
                          fontSize: theme.fontSize('sm'),
                          color: theme.colors.textAlt,
                        }}
                      >
                        {i18n.t(phoneIssueKeys[formatted.possibility], {
                          number: ltrIsolate(formatted.number?.input ?? ''),
                        })}
                      </Text>
                    )}
                  </View>
                </InputRowContainer>
              )
            if (field.kind === 'email')
              return (
                <TextInputRow
                  key={field.id}
                  label={i18n.t('email')}
                  ref={(input) => {
                    inputs.current[field.id] = input
                  }}
                  controlWidth='auto'
                  // Under its label (accessibility sizes) it takes the row.
                  controlStyle={
                    largeText ? undefined : { width: '76%', minWidth: 0 }
                  }
                  textInputProps={{
                    placeholder: i18n.t('email_placeholder'),
                    type: 'email',
                    onChangeText: (val: string) => setEmail(val),
                    value: contact.email,
                    autoCapitalize: 'none',
                    textAlign: 'start',
                    ...keyboardProps(index),
                  }}
                  lastInSection={last}
                />
              )
            if (field.kind !== 'custom') return null
            const def = field.definition
            return (
              <View key={field.id}>
                <TextInputRow
                  label={def.label}
                  ref={(input) => {
                    inputs.current[field.id] = input
                  }}
                  controlWidth='full'
                  textInputProps={{
                    placeholder: i18n.t('goesHere'),
                    onChangeText: (value: string) => {
                      setCustomField(def.id, value)
                    },
                    value: customFields?.[def.id] ?? '',
                    autoCapitalize: 'words',
                    textAlign: 'start',
                    ...keyboardProps(index),
                  }}
                  lastInSection={last}
                />
                <CustomFieldPrivacyWarning
                  texts={[def.label, customFields?.[def.id] ?? '']}
                />
              </View>
            )
          })}
        </Section>
      )}
    </View>
  )
}
