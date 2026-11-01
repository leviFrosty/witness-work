import { contactEditPatch, mayApplyGeocode } from '@/lib/contactEdits'
import React, { useRef, useState, useCallback, useEffect } from 'react'
import { Alert, TextInput, View } from 'react-native'
import Text from '@/components/ui/MyText'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContacts from '@/stores/contactsStore'
import useTheme from '@/contexts/theme'
import { Address, Contact, Coordinate } from '@/types/contact'
import KeyboardAwareScrollView from '@/components/ui/layout/KeyboardAwareScrollView'
import Header from '@/components/ui/layout/Header'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import * as Localization from 'expo-localization'
import { fetchCoordinateFromAddress } from '@/lib/address'
import Loader from '@/components/ui/Loader'
import isEqual from 'lodash/isEqual'
import { canonicalJson } from '@/lib/canonicalJson'
import Button from '@/components/ui/Button'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'

import PersonalContactSection, {
  type PersonalContactSectionHandle,
} from '@/features/contacts/components/PersonalContactSection'
import AddressSection from '@/features/contacts/components/AddressSection'
import { RootStackParamList } from '@/types/rootStack'
import { Errors } from '@/types/textInput'
import ContactIdentityCard from '@/features/contacts/components/ContactIdentityCard'
import ContactConsentSection from '@/features/contacts/components/ContactConsentSection'
import { analytics } from '@/lib/analytics'
import { classifyNetworkError } from '@/lib/http/networkError'
import { isDeviceOffline } from '@/lib/http/online'
import {
  getContactInformationFields,
  nextKeyboardField,
} from '@/lib/contactInformationFields'
import { isRetryableGeocodeFailure } from '@/lib/geocodeRetry'
import { useGeocodeRetry } from '@/stores/geocodeRetry'
import useDiscardChangesGuard from '@/hooks/useDiscardChangesGuard'
import useDraftChanged from '@/hooks/useDraftChanged'
import { contactDraftForChanges } from '@/features/contacts/lib/contactDraft'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'

type Props = NativeStackScreenProps<RootStackParamList, 'Contact Form'>

const GEOCODE_NAV_TIMEOUT_MS = 4000

const ContactFormScreen = ({ route, navigation }: Props) => {
  const foldColumn = useFoldColumn(680)
  const theme = useTheme()
  const { addContact, contacts, updateContact, customFieldDefs } = useContacts()
  const {
    incrementGeocodeApiCallCount,
    prefillAddress,
    updatePrefillAddress,
    clearPrefillAddress,
    defaultPhoneRegionCode,
    setDefaultPhoneRegionCode,
    dataProtectionMode,
    contactInformationOrder,
    showContactPhone,
    showContactEmail,
  } = usePreferences()
  const editMode = route.params.edit
  const [errors, setErrors] = useState<Errors>({
    name: '',
  })
  const originalContact = useRef(
    editMode ? contacts.find((c) => c.id === route.params.id) : undefined
  )
  const contactToUpdate = originalContact.current
  const locales = Localization.getLocales()

  const pickedPlace = useRef<{ address: Address; coordinate: Coordinate }>(null)
  const [fetching, setFetching] = useState(false)
  const prefillKeys = prefillAddress.address
    ? Object.keys(prefillAddress.address)
    : null
  const prefillHasMinOneVal = (prefillKeys as (keyof Address)[] | null)?.some(
    (k) => !!prefillAddress.address?.[k]?.length
  )

  const prefill =
    !dataProtectionMode &&
    prefillAddress?.enabled &&
    moment().isSame(prefillAddress.lastUpdated, 'day') &&
    prefillAddress.address &&
    prefillHasMinOneVal &&
    !route.params.initialCoordinate &&
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
      name: route.params.name ?? '',
      address: newContactAddress,
      coordinate: route.params.initialCoordinate,
      userDraggedCoordinate: route.params.initialCoordinate ? true : undefined,
      email: '',
      phone: '',
      phoneRegionCode: defaultPhoneRegionCode || locales[0].regionCode || '',
      customFields: {},
    }
  )

  const allowLeave = useDiscardChangesGuard(
    useDraftChanged(contactDraftForChanges(contact, contactToUpdate))
  )

  const hasConsent = !!contact.consentGivenAt
  const consentRequired = dataProtectionMode && !editMode
  const detailsVisible = !consentRequired || hasConsent

  const setConsent = (agreed: boolean) => {
    setContact((current) => ({
      ...current,

      consentGivenAt: agreed ? new Date().toISOString() : undefined,
    }))
    if (agreed && errors.consent) {
      setErrors((current) => ({ ...current, consent: '' }))
    }
  }

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
    if (regionCode) {
      setDefaultPhoneRegionCode(regionCode)
    }
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
    const customFields = { ...contact.customFields }
    if (value.length === 0) {
      delete customFields[key]
    } else {
      customFields[key] = value
    }

    setContact({
      ...contact,
      customFields,
    })
  }

  const nameInput = useRef<TextInput>(null)
  const searchInput = useRef<TextInput>(null)
  const line1Input = useRef<TextInput>(null)
  const line2Input = useRef<TextInput>(null)
  const cityInput = useRef<TextInput>(null)
  const stateInput = useRef<TextInput>(null)
  const zipInput = useRef<TextInput>(null)
  const countryInput = useRef<TextInput>(null)
  const infoSection = useRef<PersonalContactSectionHandle>(null)

  const infoFields = getContactInformationFields(
    customFieldDefs,
    contactInformationOrder,
    { phone: showContactPhone, email: showContactEmail }
  )
  const hasInfoKeyboardField = !!nextKeyboardField(infoFields, -1)

  const validateForm = useCallback((): boolean => {
    if (consentRequired && !hasConsent) {
      setErrors({
        name: '',
        consent: i18n.t('dataProtectionConsentRequiredError'),
      })
      return false
    }
    if (!contact.name) {
      nameInput.current?.focus()
      setErrors({ name: i18n.t('name_error') })
      return false
    }
    if (contact.name) {
      setErrors({ name: '' })
    }
    return true
  }, [consentRequired, contact.name, hasConsent])

  const handleFetchCoordinate = useCallback(
    async (c: Contact): Promise<Contact> => {
      setFetching(true)
      try {
        const position = await fetchCoordinateFromAddress(
          incrementGeocodeApiCallCount,
          c.address
        )
        if (position) {
          return {
            ...c,
            coordinate: position,
            userDraggedCoordinate: undefined,
          }
        }
      } catch (error) {
        const kind = classifyNetworkError(error)
        const saved = useContacts
          .getState()
          .contacts.find((item) => item.id === c.id)
        const queued =
          isRetryableGeocodeFailure(kind) &&
          !!saved &&
          mayApplyGeocode(c, saved)
        if (queued) useGeocodeRetry.getState().enqueue(saved)
        if (isDeviceOffline(kind)) {
          Alert.alert(
            i18n.t('internetUnavailable'),
            i18n.t(
              queued
                ? 'couldNotFetchCoordinatesFromAddress_retry'
                : 'couldNotFetchCoordinatesFromAddress'
            )
          )
        }
      }
      return c
    },
    [incrementGeocodeApiCallCount]
  )

  const persistThenGeocode = useCallback(
    (
      c: Contact,
      commit: (c: Contact) => void,
      shouldGeocode: boolean,
      resolve: (value: unknown) => void
    ) => {
      const picked = pickedPlace.current
      if (
        shouldGeocode &&
        picked &&
        canonicalJson(picked.address) === canonicalJson(c.address)
      ) {
        const located = {
          ...c,
          coordinate: picked.coordinate,
          userDraggedCoordinate: undefined,
        }
        commit(located)
        resolve(located)
        return
      }
      commit(c)

      if (!shouldGeocode || dataProtectionMode) {
        resolve(c)
        return
      }
      setFetching(true)
      let settled = false
      const proceed = () => {
        if (settled) {
          return
        }
        settled = true
        setFetching(false)
        resolve(c)
      }
      const timeout = setTimeout(proceed, GEOCODE_NAV_TIMEOUT_MS)
      handleFetchCoordinate(c).then((geocoded) => {
        if (geocoded.coordinate) {
          const latest = useContacts
            .getState()
            .contacts.find((item) => item.id === c.id)
          if (mayApplyGeocode(c, latest)) {
            updateContact({ id: c.id, coordinate: geocoded.coordinate })
          }
        }
        clearTimeout(timeout)
        proceed()
      })
    },
    [dataProtectionMode, handleFetchCoordinate, updateContact]
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
              updateContact(
                contactToUpdate
                  ? contactEditPatch(
                      contactToUpdate,
                      contact,
                      useContacts
                        .getState()
                        .contacts.find((current) => current.id === contact.id)
                    )
                  : contact
              )
              setFetching(false)
              resolve(contact)
            },
          },
          {
            style: 'destructive',
            text: i18n.t('fetchCoordinate'),
            onPress: () =>
              persistThenGeocode(
                { ...contact, userDraggedCoordinate: undefined },
                (value) =>
                  updateContact(
                    contactToUpdate
                      ? contactEditPatch(
                          contactToUpdate,
                          value,
                          useContacts
                            .getState()
                            .contacts.find((current) => current.id === value.id)
                        )
                      : value
                  ),
                true,
                resolve
              ),
          },
        ]
      )
    },
    [contactToUpdate, persistThenGeocode, updateContact]
  )

  const handleUpdateContact = useCallback(
    async (resolve: (value: unknown) => void) => {
      const newContact = { ...contact }
      const addressChanged = !isEqual(contactToUpdate?.address, contact.address)
      if (
        !dataProtectionMode &&
        contact.userDraggedCoordinate &&
        addressChanged
      ) {
        await askUserToUpdateCoordinatesAutomatically(newContact, resolve)
        return
      }
      persistThenGeocode(
        newContact,
        (value) =>
          updateContact(
            contactToUpdate
              ? contactEditPatch(
                  contactToUpdate,
                  value,
                  useContacts
                    .getState()
                    .contacts.find((current) => current.id === value.id)
                )
              : value
          ),
        addressChanged || !contact.coordinate,
        resolve
      )
    },
    [
      askUserToUpdateCoordinatesAutomatically,
      contact,
      contactToUpdate,
      dataProtectionMode,
      persistThenGeocode,
      updateContact,
    ]
  )

  const handleAddContact = useCallback(
    (resolve: (value: unknown) => void) => {
      const newContact = { ...contact }
      if (!dataProtectionMode) updatePrefillAddress(newContact.address)
      persistThenGeocode(
        newContact,
        addContact,
        !newContact.userDraggedCoordinate && !!newContact.address,
        resolve
      )
    },
    [
      addContact,
      contact,
      dataProtectionMode,
      persistThenGeocode,
      updatePrefillAddress,
    ]
  )

  const submit = useCallback(() => {
    return new Promise((resolve) => {
      if (editMode) {
        handleUpdateContact(resolve)
      } else {
        handleAddContact(resolve)
      }

      if (dataProtectionMode) clearPrefillAddress()
    })
  }, [
    clearPrefillAddress,
    dataProtectionMode,
    editMode,
    handleAddContact,
    handleUpdateContact,
  ])

  useEffect(() => {
    const unsubscribeFromNavListener = navigation.addListener(
      'transitionStart',
      () => setFetching(false)
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
                  allowLeave()
                  if (!editMode)
                    analytics.capture('contact_created', {
                      custom_field_count: Object.keys(
                        contact.customFields ?? {}
                      ).length,
                      has_address: !!contact.address,
                      has_location: !!contact.coordinate,
                    })
                  if (editMode && route.params.returnToContacts) {
                    navigation.goBack()
                    return
                  }
                  if (editMode) {
                    navigation.replace('Contact Details', {
                      id: (params as { id: string }).id,
                    })
                    return
                  }
                  navigation.replace('Visit Form', {
                    contactId: (params as { id: string }).id,
                    fromContactForm: true,
                    returnToContacts: route.params.returnToContacts,
                    logVisit: route.params.logVisit,
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
    allowLeave,
    contact.address,
    contact.coordinate,
    contact.customFields,
    editMode,
    route.params.returnToContacts,
    route.params.logVisit,
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
      enableResetScrollToCoords={false}
      keyboardShouldPersistTaps='handled'
      style={{ backgroundColor: theme.colors.background, position: 'relative' }}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <Wrapper
        insets='none'
        style={[
          {
            gap: 24,
            marginTop: 8,
            paddingHorizontal: 12,
            alignSelf: 'center',
            width: '100%',
            maxWidth: 680,
          },
          foldColumn,
        ]}
      >
        {dataProtectionMode && (
          <ContactConsentSection
            agreed={hasConsent}
            onConsentChange={setConsent}
            error={errors.consent}
            showRequiredHint={!detailsVisible}
          />
        )}
        {detailsVisible && (
          <ContactIdentityCard
            contact={contact}
            setContact={setContact}
            editMode={editMode}
            nameInput={nameInput}
            nameError={errors.name}
            onNameChange={(name) => {
              setName(name)
              if (errors.name) setErrors({ ...errors, name: '' })
            }}
            onNameSubmit={() =>
              (line1Input.current ?? searchInput.current)?.focus()
            }
          />
        )}
        {detailsVisible && (
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
            onPlacePicked={(address, coordinate) => {
              pickedPlace.current = coordinate ? { address, coordinate } : null
            }}
            searchInput={searchInput}
            onSubmitLastField={
              hasInfoKeyboardField
                ? () => infoSection.current?.focusFirst()
                : undefined
            }
          />
        )}
        {detailsVisible && (
          <PersonalContactSection
            contact={contact}
            fields={infoFields}
            ref={infoSection}
            setEmail={setEmail}
            setPhone={setPhone}
            setRegionCode={setRegionCode}
            customFields={contact.customFields || {}}
            setCustomField={setCustomField}
          />
        )}
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ContactFormScreen
