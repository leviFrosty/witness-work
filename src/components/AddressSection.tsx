import { TextInput, View } from 'react-native'
import { Address, Contact } from '../types/contact'
import useTheme from '../contexts/theme'
import { useState } from 'react'
import XView from './layout/XView'
import Text from './MyText'
import i18n from '../lib/locales'
import Button from './Button'
import Section from './inputs/Section'
import TextInputRow from './inputs/TextInputRow'
import PinLocation from './PinLocation'
import AddressAutocomplete from './AddressAutocomplete'
import Divider from './Divider'
import IconButton from './IconButton'
import { faBolt } from '@fortawesome/free-solid-svg-icons'

export default function AddressSection({
  contact,
  setContact,
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
  prefill,
}: {
  contact: Contact
  setContact: (value: React.SetStateAction<Contact>) => void
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
  prefill:
    | {
        readonly address: Address
        readonly enabled: true
      }
    | {
        readonly address: undefined
        readonly enabled: false
      }
}) {
  const theme = useTheme()
  const [hasCleared, setHasCleared] = useState(false)
  const keysSameAsPrefill = (): (keyof Address)[] => {
    if (!contact.address || !prefill.address) {
      return []
    }
    const keys: (keyof Address)[] = []
    Object.keys(contact.address).forEach((k) => {
      const key = k as keyof Address
      if (
        prefill.address[key] !== undefined &&
        contact.address![key] !== undefined &&
        contact.address![key] === prefill.address[key]
      ) {
        keys.push(key)
      }
    })

    return keys
  }

  const clearPrefill = () => {
    const clearedPrefill: Address = { ...contact.address }
    for (const key of keysSameAsPrefill()) {
      if (clearedPrefill) {
        delete clearedPrefill[key]
      }
    }
    setHasCleared(true)
    setContact({ ...contact, address: clearedPrefill })
  }

  const handleAddressSelect = (selectedAddress: Address) => {
    console.log('Handling address', selectedAddress)
    setContact((prevContact) => ({
      ...prevContact,
      address: selectedAddress,
    }))
  }

  return (
    <View style={{ paddingBottom: 80 }}>
      <AddressAutocomplete onSelect={handleAddressSelect} />
      <Divider marginVertical={20} />
      {prefill.enabled && !!keysSameAsPrefill().length && !hasCleared && (
        <XView
          style={{
            marginRight: 10,
            marginBottom: 10,
            justifyContent: 'flex-end',
          }}
        >
          <View
            style={{
              borderRadius: theme.numbers.borderRadiusLg,
              paddingHorizontal: 20,
              paddingVertical: 5,
              borderColor: theme.colors.accent,
              backgroundColor: theme.colors.accentTranslucent,
              borderWidth: 1,
              flexDirection: 'row',
              gap: 10,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: 3,
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                }}
              >
                {i18n.t('prefilledAddress')}
              </Text>
              <IconButton icon={faBolt} color={theme.colors.accent} />
            </View>
            <Button onPress={clearPrefill}>
              <Text style={{ textDecorationLine: 'underline' }}>
                {i18n.t('clear')}
              </Text>
            </Button>
          </View>
        </XView>
      )}
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
      <Divider marginVertical={20} />
      <Section>
        <PinLocation setContact={setContact} contact={contact} />
      </Section>
    </View>
  )
}
