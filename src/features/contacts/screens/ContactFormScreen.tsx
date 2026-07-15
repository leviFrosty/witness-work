import {
  CircleQuestionMark as CircleQuestionMarkIcon,
  Mars as MarsIcon,
  Venus as VenusIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import React, { useRef, useState, useCallback, useEffect } from 'react'
import {
  Alert,
  Pressable,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native'
import { Input, InputProps, Popover } from 'tamagui'
import { GENDER_COLORS } from '@/features/contacts/components/GenderIcon'
import Text from '@/components/ui/MyText'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import useContacts from '@/stores/contactsStore'
import useTheme from '@/contexts/theme'
import { Address, Contact } from '@/types/contact'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import Header from '@/components/ui/layout/Header'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import * as Localization from 'expo-localization'
import { fetchCoordinateFromAddress } from '@/lib/address'
import Loader from '@/components/ui/Loader'
import isEqual from 'lodash/isEqual'
import Button from '@/components/ui/Button'
import { usePreferences } from '@/stores/preferences'
import moment from 'moment'

import PersonalContactSection from '@/features/contacts/components/PersonalContactSection'
import AddressSection from '@/features/contacts/components/AddressSection'
import { RootStackParamList } from '@/types/rootStack'
import { Errors } from '@/types/textInput'
import AvatarPickerPopover from '@/components/AvatarPickerPopover'
import { ProfileAvatar } from '@/types/avatar'
import {
  BackgroundSwatches,
  BACKGROUND_SWATCHES_WIDTH,
} from '@/components/AvatarPickerContent'
import IsSupporter from '@/components/IsSupporter'

type Props = NativeStackScreenProps<RootStackParamList, 'Contact Form'>

/**
 * Max time Save keeps the user on the form (spinner showing) waiting for a
 * geocode before navigating anyway. The geocode keeps running in the background
 * past this and patches the coordinate when it resolves, so a slow or hung
 * request (axios has no timeout) can never stall navigation.
 */
const GEOCODE_NAV_TIMEOUT_MS = 4000

/**
 * Compact entry-point for editing the per-contact background color. Always
 * opens a popover — non-supporters see the swatch row dimmed via `IsSupporter`
 * so they discover the perk without a separate gate sheet.
 */
const BackgroundEditButton = ({
  value,
  onChange,
}: {
  value: string | null
  onChange: (next: string | null) => void
}) => {
  const theme = useTheme()
  const { width } = useWindowDimensions()
  const [pickerOpen, setPickerOpen] = useState(false)
  const swatchColor = value ?? theme.colors.accent
  const popoverPadding = 10
  const popoverExtraWidth = 28
  const popoverWidth = Math.min(
    BACKGROUND_SWATCHES_WIDTH + popoverPadding * 2 + popoverExtraWidth,
    width - 32
  )

  const triggerStyle = {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: theme.colors.backgroundLighter,
    alignSelf: 'center' as const,
  }

  return (
    <Popover
      open={pickerOpen}
      onOpenChange={setPickerOpen}
      placement='bottom'
      allowFlip
      offset={8}
    >
      <Popover.Trigger asChild>
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          accessibilityRole='button'
          accessibilityLabel={i18n.t('contactHeroBackgroundColor')}
          style={triggerStyle}
        >
          <View
            style={{
              width: 14,
              height: 14,
              borderRadius: 7,
              backgroundColor: swatchColor,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: theme.colors.border,
            }}
          />
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              fontFamily: theme.fonts.medium,
            }}
          >
            {i18n.t('contactHeroBackgroundColor')}
          </Text>
        </Pressable>
      </Popover.Trigger>
      <Popover.Content
        borderWidth={1}
        borderColor={theme.colors.border}
        backgroundColor={theme.colors.card}
        padding={popoverPadding}
        elevate
        transition={[
          'quick',
          {
            opacity: { overshootClamping: true },
          },
        ]}
        enterStyle={{ y: -8, opacity: 0 }}
        exitStyle={{ y: -8, opacity: 0 }}
        width={popoverWidth}
        maxWidth={popoverWidth}
      >
        <Popover.Arrow
          borderWidth={1}
          borderColor={theme.colors.border}
          backgroundColor={theme.colors.card}
        />
        <IsSupporter feature='customAccentColor' size='sm'>
          <BackgroundSwatches value={value} onChange={onChange} />
        </IsSupporter>
      </Popover.Content>
    </Popover>
  )
}

const ContactFormScreen = ({ route, navigation }: Props) => {
  const theme = useTheme()
  const { addContact, contacts, updateContact } = useContacts()
  const {
    incrementGeocodeApiCallCount,
    prefillAddress,
    updatePrefillAddress,
    defaultPhoneRegionCode,
    setDefaultPhoneRegionCode,
  } = usePreferences()
  const editMode = route.params.edit
  const [errors, setErrors] = useState<Errors>({
    name: '',
  })
  const contactToUpdate = editMode
    ? contacts.find((c) => c.id === route.params.id)
    : undefined
  const locales = Localization.getLocales()
  const geocodeAbortController = useRef<AbortController>(null)
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
      phoneRegionCode: defaultPhoneRegionCode || locales[0].regionCode || '',
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
        geocodeAbortController.current ?? undefined
      )
      if (position) {
        c.coordinate = position
        c.userDraggedCoordinate = undefined
      }
      return c
    },
    [incrementGeocodeApiCallCount]
  )

  /**
   * Saves `c` via `commit` immediately so it can never be lost to a slow or
   * hung geocode, then — when `shouldGeocode` — runs the geocode while showing
   * the Save spinner. Resolves (which unblocks the caller's navigation) as soon
   * as the geocode lands OR after {@link GEOCODE_NAV_TIMEOUT_MS}, whichever
   * comes first. The geocode keeps running past a timeout and patches the
   * coordinate via `updateContact` once it resolves.
   */
  const persistThenGeocode = useCallback(
    (
      c: Contact,
      commit: (c: Contact) => void,
      shouldGeocode: boolean,
      resolve: (value: unknown) => void
    ) => {
      commit(c)
      if (!shouldGeocode) {
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
          updateContact(geocoded)
        }
        clearTimeout(timeout)
        proceed()
      })
    },
    [handleFetchCoordinate, updateContact]
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
      const addressChanged = !isEqual(contactToUpdate?.address, contact.address)
      if (contact.userDraggedCoordinate && addressChanged) {
        // Ask the user if they wanna update their coordinate automatically.
        // This path persists the contact inside the alert handlers.
        await askUserToUpdateCoordinatesAutomatically(newContact, resolve)
        return
      }
      persistThenGeocode(
        newContact,
        updateContact,
        addressChanged || !contact.coordinate,
        resolve
      )
    },
    [
      askUserToUpdateCoordinatesAutomatically,
      contact,
      contactToUpdate?.address,
      persistThenGeocode,
      updateContact,
    ]
  )

  const handleAddContact = useCallback(
    (resolve: (value: unknown) => void) => {
      const newContact = { ...contact }
      updatePrefillAddress(newContact.address)
      persistThenGeocode(
        newContact,
        addContact,
        !newContact.userDraggedCoordinate && !!newContact.address,
        resolve
      )
    },
    [addContact, contact, persistThenGeocode, updatePrefillAddress]
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
                  navigation.replace('Visit Form', {
                    contactId: (params as { id: string }).id,
                    fromContactForm: true,
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
      enableResetScrollToCoords={false}
      keyboardShouldPersistTaps='handled'
      style={{ backgroundColor: theme.colors.background, position: 'relative' }}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <Wrapper insets='none' style={{ gap: 24, marginTop: 8 }}>
        <View
          style={{
            alignItems: 'center',
            paddingTop: 20,
            paddingBottom: 24,
            paddingHorizontal: 28,
            gap: 18,
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
            {editMode ? i18n.t('edit') : i18n.t('add')} {i18n.t('contact')}
          </Text>
          <AvatarPickerPopover
            value={contact.avatar ?? { type: 'none', value: '' }}
            onChange={(next: ProfileAvatar) =>
              setContact({ ...contact, avatar: next })
            }
            onImageMeta={(meta) =>
              setContact((c) => ({ ...c, avatarMeta: meta }))
            }
            name={contact.name}
            size={104}
            imageFileName={`contact-${contact.id}-avatar.jpg`}
            background={contact.avatarBackground ?? undefined}
            backgroundValue={contact.avatarBackground ?? null}
            onBackgroundChange={(next) =>
              setContact({ ...contact, avatarBackground: next })
            }
          />
          <BackgroundEditButton
            value={contact.heroBackground ?? null}
            onChange={(next) =>
              setContact({ ...contact, heroBackground: next })
            }
          />
          <View style={{ alignItems: 'center', gap: 6, width: '100%' }}>
            <Input
              unstyled
              ref={nameInput}
              value={contact.name}
              onChangeText={(val) => {
                setName(val)
                if (errors.name) setErrors({ ...errors, name: '' })
              }}
              placeholder={i18n.t('name_placeholder')}
              placeholderTextColor={
                theme.colors.textAlt as InputProps['placeholderTextColor']
              }
              autoCapitalize='words'
              autoCorrect={false}
              autoFocus={!editMode}
              autoFocusNative={!editMode}
              enterKeyHint='next'
              style={{
                fontSize: 26,
                fontFamily: theme.fonts.bold,
                color: theme.colors.text,
                textAlign: 'center',
                width: '100%',
                paddingVertical: 4,
              }}
            />
            {errors.name && (
              <Text
                style={{
                  fontSize: 12,
                  color: theme.colors.error,
                  fontFamily: theme.fonts.semiBold,
                  textAlign: 'center',
                }}
              >
                {errors.name}
              </Text>
            )}
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                gap: 10,
                marginTop: 6,
              }}
            >
              {(
                [
                  { key: 'male', icon: MarsIcon, color: GENDER_COLORS.male },
                  {
                    key: 'female',
                    icon: VenusIcon,
                    color: GENDER_COLORS.female,
                  },
                  {
                    key: 'unknown',
                    icon: CircleQuestionMarkIcon,
                    color: theme.colors.textAlt,
                  },
                ] as const
              ).map(({ key, icon, color }) => {
                const selected = contact.gender === key
                return (
                  <Pressable
                    key={key}
                    accessibilityLabel={i18n.t(`gender_${key}`)}
                    accessibilityState={{ selected }}
                    hitSlop={8}
                    onPress={() =>
                      setContact({
                        ...contact,
                        gender: selected ? undefined : key,
                      })
                    }
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 16,
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: selected ? `${color}26` : 'transparent',
                      borderWidth: 1,
                      borderColor: selected ? color : theme.colors.border,
                    }}
                  >
                    <LucideIcon
                      icon={icon}
                      size={14}
                      style={{
                        color: selected ? color : theme.colors.textAlt,
                        opacity: selected ? 1 : 0.7,
                      }}
                    />
                  </Pressable>
                )
              })}
            </View>
          </View>
        </View>
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
        <PersonalContactSection
          contact={contact}
          emailInput={emailInput}
          setEmail={setEmail}
          setPhone={setPhone}
          setRegionCode={setRegionCode}
          customFields={contact.customFields || {}}
          setCustomField={setCustomField}
          clearCustomField={clearCustomField}
        />
      </Wrapper>
    </KeyboardAwareScrollView>
  )
}

export default ContactFormScreen
