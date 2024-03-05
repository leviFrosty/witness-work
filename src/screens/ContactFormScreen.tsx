import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { TextInput, View, useColorScheme } from 'react-native'
import Text from '../components/MyText'
import { RootStackParamList } from '../stacks/RootStack'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContacts from '../stores/contactsStore'
import useTheme from '../contexts/theme'
import Divider from '../components/Divider'
import { Contact } from '../types/contact'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Section from '../components/inputs/Section'
import TextInputRow, { Errors } from '../components/inputs/TextInputRow'
import Header from '../components/layout/Header'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import PhoneInput, {
  ICountry,
  ITheme,
  getCountryByCca2,
} from 'react-native-international-phone-number'
import * as Localization from 'expo-localization'
import { ICountryCca2 } from 'react-native-international-phone-number/lib/interfaces/countryCca2'
import InputRowContainer from '../components/inputs/InputRowContainer'
import IconButton from '../components/IconButton'
import { faCaretDown, faIdCard } from '@fortawesome/free-solid-svg-icons'
import { parsePhoneNumber } from 'awesome-phonenumber'
import { fetchCoordinateFromAddress } from '../lib/address'
import Loader from '../components/Loader'
import _ from 'lodash'
import Button from '../components/Button'
import { usePreferences } from '../stores/preferences'

const PersonalContactSection = ({
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
}) => {
  const placeholder = useRef(contact.phone || '')
  const locales = Localization.getLocales()

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
        lastInSection
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
    </Section>
  )
}

const AddressSection = ({
  contact,
  line1Input,
  line2Input,
  setLine1,
  cityInput,
  setLine2,
  setCity,
  stateInput,
  setState,
  zipInput,
  countryInput,
  setZip,
  setCountry,
}: {
  contact: Contact
  line1Input: React.RefObject<TextInput>
  line2Input: React.RefObject<TextInput>
  setLine1: (line1: string) => void
  cityInput: React.RefObject<TextInput>
  setLine2: (line2: string) => void
  setCity: (city: string) => void
  stateInput: React.RefObject<TextInput>
  setState: (state: string) => void
  zipInput: React.RefObject<TextInput>
  countryInput: React.RefObject<TextInput>
  setZip: (zip: string) => void
  setCountry: (country: string) => void
}) => {
  return (
    <Section>
      <TextInputRow
        label={i18n.t('addressLine1')}
        ref={line1Input}
        textInputProps={{
          onSubmitEditing: () => line2Input.current?.focus(),
          onChangeText: (val: string) => setLine1(val),
          autoCapitalize: 'words',
          value: contact.address?.line1 || '',
        }}
      />
      <TextInputRow
        label={i18n.t('addressLine2')}
        ref={line2Input}
        textInputProps={{
          onSubmitEditing: () => cityInput.current?.focus(),
          onChangeText: (val: string) => setLine2(val),
          value: contact.address?.line2 || '',
          autoCapitalize: 'words',
        }}
      />
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ width: '50%' }}>
          <TextInputRow
            label={i18n.t('city')}
            ref={cityInput}
            textInputProps={{
              onSubmitEditing: () => stateInput.current?.focus(),
              onChangeText: (val: string) => setCity(val),
              autoCapitalize: 'words',
              value: contact.address?.city || '',
            }}
          />
        </View>
        <View style={{ width: '50%' }}>
          <TextInputRow
            label={i18n.t('state')}
            ref={stateInput}
            textInputProps={{
              onSubmitEditing: () => zipInput.current?.focus(),
              onChangeText: (val: string) => setState(val),
              value: contact.address?.state || '',
              autoCapitalize: 'words',
            }}
          />
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ width: '50%' }}>
          <TextInputRow
            label={i18n.t('zip')}
            ref={zipInput}
            textInputProps={{
              onSubmitEditing: () => countryInput.current?.focus(),
              onChangeText: (val: string) => setZip(val),
              value: contact.address?.zip || '',
              keyboardType: 'number-pad',
            }}
            lastInSection
          />
        </View>
        <View style={{ width: '50%' }}>
          <TextInputRow
            label={i18n.t('country')}
            ref={countryInput}
            textInputProps={{
              onChangeText: (val: string) => setCountry(val),
              value: contact.address?.country || '',
              autoCapitalize: 'words',
            }}
            lastInSection
          />
        </View>
      </View>
    </Section>
  )
}

type Props = NativeStackScreenProps<RootStackParamList, 'Contact Form'>

const ContactFormScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { addContact, contacts, updateContact } = useContacts()
  const { incrementGeocodeApiCallCount } = usePreferences()
  const editMode = route.params.edit
  const [errors, setErrors] = useState<Errors>({
    name: '',
  })
  const contactToUpdate = editMode
    ? contacts.find((c) => c.id === route.params.id)
    : undefined
  const locales = Localization.getLocales()
  const geocodeAbortController = useRef<AbortController>()
  const [fetching, setFetching] = useState(false)

  const [contact, setContact] = useState<Contact>(
    contactToUpdate || {
      id: route.params.id,
      createdAt: new Date(),
      name: '',
      address: {
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        country: '',
      },
      email: '',
      phone: '',
      phoneRegionCode: locales[0].regionCode || '',
    }
  )

  const setName = (name: string) => {
    setContact({
      ...contact,
      name,
    })
  }

  const setPhone = (phone: string) => {
    setContact({
      ...contact,
      phone,
    })
  }

  const setRegionCode = (regionCode: string) => {
    setContact({
      ...contact,
      phoneRegionCode: regionCode,
    })
  }

  const setEmail = (email: string) => {
    setContact({
      ...contact,
      email,
    })
  }

  const setLine1 = (line1: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        line1,
      },
    })
  }
  const setLine2 = (line2: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        line2,
      },
    })
  }
  const setCity = (city: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        city,
      },
    })
  }
  const setState = (state: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        state,
      },
    })
  }
  const setZip = (zip: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        zip,
      },
    })
  }
  const setCountry = (country: string) => {
    setContact({
      ...contact,
      address: {
        ...contact.address,
        country,
      },
    })
  }
  const nameInput = useRef<TextInput>(null)
  const emailInput = useRef<TextInput>(null)
  const line1Input = useRef<TextInput>(null)
  const line2Input = useRef<TextInput>(null)
  const cityInput = useRef<TextInput>(null)
  const stateInput = useRef<TextInput>(null)
  const zipInput = useRef<TextInput>(null)
  const countryInput = useRef<TextInput>(null)

  const validateForm = useCallback((): boolean => {
    if (!contact.name) {
      nameInput.current?.focus()
      setErrors({ name: i18n.t('name_error') })
      return false
    }
    if (contact.name) {
      setErrors({ name: '' })
    }
    return true
  }, [contact.name])

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      geocodeAbortController.current?.abort()

      const passesValidation = validateForm()

      if (!passesValidation) {
        return resolve(false)
      }

      const contactMaybeWithCoordinates = { ...contact }
      const addressHasNotChanged = _.isEqual(
        contactToUpdate?.address,
        contact.address
      )

      const handleGetCoordinate = () => {
        return new Promise<void>((innerResolve) => {
          const handleFetch = async () => {
            try {
              setFetching(true)

              if (addressHasNotChanged) {
                return innerResolve()
              }

              const position = await fetchCoordinateFromAddress(
                incrementGeocodeApiCallCount,
                contact.address,
                geocodeAbortController.current
              )

              if (position) {
                contactMaybeWithCoordinates.coordinate = position
              } else {
                contactMaybeWithCoordinates.coordinate = undefined
              }

              return innerResolve()
            } catch (error) {
              // If there was an error fetching the geocode, we just silently ignore.
              // The user likely input an invalid address.
              // Given we have no address suggestions / validation, we can't do much here.
              return innerResolve()
            }
          }

          if (editMode && addressHasNotChanged) {
            return innerResolve()
          }

          handleFetch()
        })
      }

      handleGetCoordinate()
        .then(() => {
          setFetching(false)

          if (editMode) {
            updateContact(contactMaybeWithCoordinates)
          } else {
            addContact(contactMaybeWithCoordinates)
          }

          resolve(contactMaybeWithCoordinates)
        })
        .finally(() => {
          geocodeAbortController.current?.abort()
        })
    })
  }, [
    addContact,
    contact,
    contactToUpdate?.address,
    editMode,
    incrementGeocodeApiCallCount,
    updateContact,
    validateForm,
  ])

  useEffect(() => {
    // Cancels coordinate fetch request if user navigates away
    const unsubscribeFromNavListener = navigation.addListener(
      'transitionStart',
      () => {
        geocodeAbortController.current?.abort()
        setFetching(false)
      }
    )

    return unsubscribeFromNavListener
  }, [navigation])

  useEffect(() => {
    navigation.setOptions({
      header: ({ route: { params }, navigation }) => (
        <Header
          title=''
          buttonType='back'
          rightElement={
            fetching ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                  flex: 1,
                }}
              >
                <Loader style={{ height: 30, width: 30 }} />
              </View>
            ) : (
              <Button
                disabled={fetching}
                style={{ position: 'absolute', right: 0 }}
                onPress={async () => {
                  const succeeded = await submit()
                  if (!succeeded) {
                    // Failed validation if didn't submit
                    return
                  }
                  if (editMode) {
                    navigation.replace('Contact Details', {
                      id: (params as { id: string }).id,
                    })
                    return
                  }
                  navigation.replace('Conversation Form', {
                    contactId: (params as { id: string }).id,
                  })
                }}
              >
                <Text
                  style={{
                    color: theme.colors.text,
                    textDecorationLine: 'underline',
                    fontSize: 16,
                  }}
                >
                  {editMode ? i18n.t('save') : i18n.t('continue')}
                </Text>
              </Button>
            )
          }
        />
      ),
    })
  }, [
    editMode,
    fetching,
    navigation,
    submit,
    theme.colors.text,
    theme.colors.textInverse,
    validateForm,
  ])

  return (
    <KeyboardAwareScrollView
      extraHeight={100}
      automaticallyAdjustContentInsets
      automaticallyAdjustKeyboardInsets
      style={{ backgroundColor: theme.colors.background, position: 'relative' }}
    >
      <Wrapper insets='none' style={{ gap: 30, marginTop: 20 }}>
        <View style={{ padding: 25, gap: 5 }}>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <IconButton
              icon={faIdCard}
              iconStyle={{ color: theme.colors.text }}
              size={20}
            />
            <Text style={{ fontSize: 32, fontFamily: theme.fonts.bold }}>
              {editMode ? i18n.t('edit') : i18n.t('add')} {i18n.t('contact')}
            </Text>
          </View>
          <Text style={{ color: theme.colors.textAlt, fontSize: 12 }}>
            {i18n.t('enterContactInformation')}
          </Text>
        </View>
        <PersonalContactSection
          contact={contact}
          emailInput={emailInput}
          line1Input={line1Input}
          nameInput={nameInput}
          setEmail={setEmail}
          setName={setName}
          setPhone={setPhone}
          setRegionCode={setRegionCode}
          errors={errors}
          setErrors={setErrors}
        />
        <Divider borderStyle='dashed' />
        <AddressSection
          contact={contact}
          cityInput={cityInput}
          countryInput={countryInput}
          line1Input={line1Input}
          line2Input={line2Input}
          setCity={setCity}
          setLine1={setLine1}
          setLine2={setLine2}
          setState={setState}
          setZip={setZip}
          setCountry={setCountry}
          stateInput={stateInput}
          zipInput={zipInput}
        />
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ContactFormScreen
