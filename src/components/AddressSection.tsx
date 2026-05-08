import { TextInput, TouchableOpacity, View } from 'react-native'
import { Address, Contact } from '../types/contact'
import useTheme from '../contexts/theme'
import { useState } from 'react'
import Text from './MyText'
import i18n, { TranslationKey } from '../lib/locales'
import Button from './Button'
import Section from './inputs/Section'
import TextInputRow from './inputs/TextInputRow'
import PinLocation from './PinLocation'
import AddressAutocomplete, { Suggestion } from './AddressAutocomplete'
import {
  faCircleInfo,
  faMagnifyingGlass,
  faPenToSquare,
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import { IconProp } from '@fortawesome/fontawesome-svg-core'
import { addressToString } from '../lib/address'

type Mode = 'search' | 'manual'

const ModeSegment: React.FC<{
  active: boolean
  icon: IconProp
  labelKey: TranslationKey
  onPress: () => void
}> = ({ active, icon, labelKey, onPress }) => {
  const theme = useTheme()
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole='button'
      accessibilityState={{ selected: active }}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 8,
        borderRadius: theme.numbers.borderRadiusSm,
        backgroundColor: active
          ? theme.colors.backgroundLighter
          : 'transparent',
        shadowColor: active ? theme.colors.shadow : undefined,
        shadowOpacity: active ? 0.08 : 0,
        shadowRadius: 2,
        shadowOffset: { width: 0, height: 1 },
      }}
    >
      <FontAwesomeIcon
        icon={icon}
        size={13}
        style={{
          color: active ? theme.colors.text : theme.colors.textAlt,
        }}
      />
      <Text
        style={{
          color: active ? theme.colors.text : theme.colors.textAlt,
          fontFamily: active ? theme.fonts.semiBold : theme.fonts.regular,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t(labelKey)}
      </Text>
    </TouchableOpacity>
  )
}

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
  line1Input: React.RefObject<TextInput | null>
  line2Input: React.RefObject<TextInput | null>
  setLine1: (line1: string) => void
  cityInput: React.RefObject<TextInput | null>
  setLine2: (line2: string) => void
  setCity: (city: string) => void
  stateInput: React.RefObject<TextInput | null>
  setState: (state: string) => void
  zipInput: React.RefObject<TextInput | null>
  countryInput: React.RefObject<TextInput | null>
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
  const [query, setQuery] = useState(addressToString(contact.address))
  const [isResult, setIsResult] = useState(!!contact.address)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [error, setError] = useState(false)
  const [mode, setMode] = useState<Mode>('search')
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
    setQuery('')
    setSuggestions([])
    setContact({ ...contact, address: clearedPrefill })
  }

  const handleAddressSelect = (selectedAddress: Address) => {
    setContact((prevContact) => ({
      ...prevContact,
      address: selectedAddress,
    }))
  }

  const switchMode = (next: Mode) => {
    if (next === mode) return
    if (next === 'search') {
      // Re-derive the search query from the structured address so the two
      // views stay in sync without copying stale data between them.
      setQuery(addressToString(contact.address))
      setIsResult(true)
    }
    setMode(next)
  }

  return (
    <View>
      <View
        style={{
          paddingLeft: 25,
          paddingRight: 20,
          marginBottom: 8,
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
          {i18n.t('address')}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          marginHorizontal: 20,
          marginBottom: 10,
          padding: 3,
          borderRadius: theme.numbers.borderRadiusSm + 3,
          backgroundColor: theme.colors.background,
          borderWidth: 1,
          borderColor: theme.colors.border,
          gap: 3,
        }}
      >
        <ModeSegment
          active={mode === 'search'}
          icon={faMagnifyingGlass}
          labelKey='searchAddress'
          onPress={() => switchMode('search')}
        />
        <ModeSegment
          active={mode === 'manual'}
          icon={faPenToSquare}
          labelKey='enterManually'
          onPress={() => switchMode('manual')}
        />
      </View>
      <Section>
        {mode === 'search' ? (
          <AddressAutocomplete
            onSelect={handleAddressSelect}
            error={error}
            query={query}
            setQuery={setQuery}
            isResult={isResult}
            setIsResult={setIsResult}
            suggestions={suggestions}
            setSuggestions={setSuggestions}
            setError={setError}
          />
        ) : (
          <>
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
          </>
        )}
        <View
          style={{
            marginTop: 8,
            marginRight: 20,
            borderTopWidth: 1,
            borderStyle: 'dashed',
            borderColor: theme.colors.border,
          }}
        />
        <PinLocation setContact={setContact} contact={contact} />
      </Section>
      {prefill.enabled && !!keysSameAsPrefill().length && !hasCleared && (
        <View
          style={{
            marginHorizontal: 20,
            marginTop: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <FontAwesomeIcon
            icon={faCircleInfo}
            size={11}
            style={{ color: theme.colors.textAlt }}
          />
          <Text
            style={{
              fontSize: theme.fontSize('xs'),
              color: theme.colors.textAlt,
              flex: 1,
            }}
          >
            {i18n.t('prefilledFromLastContact_short')}
          </Text>
          <Button onPress={clearPrefill}>
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                textDecorationLine: 'underline',
              }}
            >
              {i18n.t('clear')}
            </Text>
          </Button>
        </View>
      )}
    </View>
  )
}
