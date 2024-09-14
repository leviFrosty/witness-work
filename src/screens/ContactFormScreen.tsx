import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Alert, TextInput, View } from 'react-native'
import Text from '../components/MyText'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContacts from '../stores/contactsStore'
import useTheme from '../contexts/theme'
import Divider from '../components/Divider'
import { Address, Contact } from '../types/contact'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Header from '../components/layout/Header'
import i18n from '../lib/locales'
import Wrapper from '../components/layout/Wrapper'
import * as Localization from 'expo-localization'
import IconButton from '../components/IconButton'
import { fetchCoordinateFromAddress } from '../lib/address'
import Loader from '../components/Loader'
import _ from 'lodash'
import Button from '../components/Button'
import { usePreferences } from '../stores/preferences'
import { faIdCard } from '@fortawesome/free-regular-svg-icons'
import moment from 'moment'

import PersonalContactSection from '../components/PersonalContactSection'
import AddressSection from '../components/AddressSection'
import { RootStackParamList } from '../types/rootStack'
import { Errors } from '../types/textInput'

type Props = NativeStackScreenProps<RootStackParamList, 'Contact Form'>

const ContactFormScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { addContact, contacts, updateContact } = useContacts()
  const { incrementGeocodeApiCallCount, prefillAddress, updatePrefillAddress } =
    usePreferences()
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
  const prefillKeys = prefillAddress.address
    ? Object.keys(prefillAddress.address)
    : null
  const prefillHasMinOneVal = (prefillKeys as (keyof Address)[] | null)?.some(
    (k) => !!prefillAddress.address?.[k]?.length
  )

  /** Whether or not address should be prefilled based on state. */
  const prefill =
    prefillAddress?.enabled &&
    moment().isSame(prefillAddress.lastUpdated, 'day') &&
    prefillAddress.address &&
    prefillHasMinOneVal &&
    !editMode
      ? ({
          address: prefillAddress.address,
          enabled: true,
        } as const)
      : ({
          address: undefined,
          enabled: false,
        } as const)

  const newContactAddress: Address = prefill.enabled
    ? prefill.address
    : {
        line1: '',
        line2: '',
        city: '',
        state: '',
        zip: '',
        country: '',
      }

  const [contact, setContact] = useState<Contact>(
    contactToUpdate || {
      id: route.params.id,
      createdAt: new Date(),
      name: '',
      address: newContactAddress,
      email: '',
      phone: '',
      phoneRegionCode: locales[0].regionCode || '',
      customFields: {},
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
  const setCustomField = (key: string, value: string) => {
    setContact({
      ...contact,
      customFields: {
        ...contact.customFields,
        [key]: value,
      },
    })
  }

  const clearCustomField = (key: string) => {
    const customFields = { ...contact.customFields }
    if (customFields[key] !== undefined) {
      delete customFields[key]
    }

    setContact({
      ...contact,
      customFields: customFields,
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

  /** Mutates provided contact */
  const handleFetchCoordinate = useCallback(
    async (c: Contact): Promise<Contact> => {
      setFetching(true)
      const position = await fetchCoordinateFromAddress(
        incrementGeocodeApiCallCount,
        c.address,
        geocodeAbortController.current
      )
      if (position) {
        c.coordinate = position
        c.userDraggedCoordinate = undefined
      }
      return c
    },
    [incrementGeocodeApiCallCount]
  )

  const askUserToUpdateCoordinatesAutomatically = useCallback(
    async (contact: Contact, resolve: (value: unknown) => void) => {
      setFetching(true)
      Alert.alert(
        i18n.t('overrideCoordinate'),
        i18n.t('overrideCoordinate_description'),
        [
          {
            style: 'cancel',
            text: i18n.t('keepExisting'),
            onPress: () => {
              updateContact(contact)
              setFetching(false)
              resolve(contact)
            },
          },
          {
            style: 'destructive',
            text: i18n.t('fetchCoordinate'),
            onPress: () =>
              handleFetchCoordinate(contact).finally(() => {
                updateContact(contact)
                setFetching(false)
                resolve(contact)
              }),
          },
        ]
      )
    },
    [handleFetchCoordinate, updateContact]
  )

  const handleUpdateContact = useCallback(
    async (resolve: (value: unknown) => void) => {
      /** This gets mutated in the conditionals below. */
      const newContact = { ...contact }
      const addressChanged = !_.isEqual(
        contactToUpdate?.address,
        contact.address
      )
      if (contact.userDraggedCoordinate && addressChanged) {
        // Ask the user if they wanna update their coordinate automatically
        await askUserToUpdateCoordinatesAutomatically(newContact, resolve)
      } else {
        if (addressChanged || !contact.coordinate) {
          handleFetchCoordinate(newContact).finally(() => {
            updateContact(newContact)
            resolve(newContact)
          })
          return
        }
        updateContact(newContact)
        resolve(newContact)
      }
    },
    [
      askUserToUpdateCoordinatesAutomatically,
      contact,
      contactToUpdate?.address,
      handleFetchCoordinate,
      updateContact,
    ]
  )

  const handleAddContact = useCallback(
    (resolve: (value: unknown) => void) => {
      const newContact = { ...contact }
      updatePrefillAddress(newContact.address)
      if (
        !newContact.userDraggedCoordinate &&
        newContact.address &&
        !!Object.keys(newContact.address)
      ) {
        handleFetchCoordinate(newContact).finally(() => {
          addContact(newContact)
          setFetching(false)
          resolve(newContact)
        })
      } else {
        // User input custom coordinate
        addContact(newContact)
        resolve(newContact)
      }
    },
    [addContact, contact, handleFetchCoordinate, updatePrefillAddress]
  )

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      if (editMode) {
        handleUpdateContact(resolve)
      } else {
        handleAddContact(resolve)
      }
    })
  }, [editMode, handleAddContact, handleUpdateContact])

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
                  if (!validateForm()) {
                    return false
                  }
                  await submit()
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
                  {i18n.t('save')}
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
      contentContainerStyle={{ paddingBottom: 100 }}
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
          customFields={contact.customFields || {}}
          setCustomField={setCustomField}
          clearCustomField={clearCustomField}
        />
        <Divider borderStyle='dashed' />
        <AddressSection
          contact={contact}
          setContact={setContact}
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
          prefill={prefill}
        />
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ContactFormScreen
