import React from 'react'
import { act, create } from 'react-test-renderer'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Contact } from '@/types/contact'
import { RootStackParamList } from '@/types/rootStack'

const mocks = vi.hoisted(() => ({
  addContact: vi.fn(),
  updateContact: vi.fn(),
  geocode: vi.fn(async () => ({ latitude: 12, longitude: 34 })),
  updatePrefillAddress: vi.fn(),
  clearPrefillAddress: vi.fn(),
  dataProtectionMode: false,
  setOptions: vi.fn(),
  replace: vi.fn(),
  goBack: vi.fn(),
  contacts: [] as Contact[],
  address: { line1: 'Previous contact street', city: 'Previous city' },
}))
vi.mock('react-native', () => ({
  View: 'View',
  TextInput: 'TextInput',
  Alert: { alert: vi.fn() },
}))
vi.mock('react-native-keyboard-aware-scroll-view', () => ({
  KeyboardAwareScrollView: 'ScrollView',
}))
vi.mock('expo-localization', () => ({
  getLocales: () => [{ regionCode: 'US' }],
}))
vi.mock('@/contexts/theme', () => ({
  default: () => ({ colors: { text: '#000', background: '#fff' } }),
}))
vi.mock('@/stores/contactsStore', () => ({ default: () => mocks }))
vi.mock('@/stores/preferences', () => ({
  usePreferences: () => ({
    prefillAddress: {
      enabled: true,
      lastUpdated: new Date(),
      address: mocks.address,
    },
    updatePrefillAddress: mocks.updatePrefillAddress,
    clearPrefillAddress: mocks.clearPrefillAddress,
    dataProtectionMode: mocks.dataProtectionMode,
  }),
}))
vi.mock('@/lib/address', () => ({ fetchCoordinateFromAddress: mocks.geocode }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/Loader', () => ({ default: 'Loader' }))
vi.mock('@/components/ui/layout/Header', () => ({ default: 'Header' }))
vi.mock('@/components/ui/layout/Wrapper', () => ({ default: 'Wrapper' }))
vi.mock('@/features/contacts/components/PersonalContactSection', () => ({
  default: 'PersonalContactSection',
}))
vi.mock('@/features/contacts/components/AddressSection', () => ({
  default: 'AddressSection',
}))
vi.mock('@/features/contacts/components/ContactIdentityCard', () => ({
  default: 'ContactIdentityCard',
}))
vi.mock('@/features/contacts/components/ContactConsentSection', () => ({
  default: 'ContactConsentSection',
}))

import ContactFormScreen from '@/features/contacts/screens/ContactFormScreen'
import AddressSection from '@/features/contacts/components/AddressSection'
import ContactIdentityCard from '@/features/contacts/components/ContactIdentityCard'
import ContactConsentSection from '@/features/contacts/components/ContactConsentSection'

let root: ReturnType<typeof create>
const navigation = {
  setOptions: mocks.setOptions,
  addListener: () => () => {},
  replace: mocks.replace,
  goBack: mocks.goBack,
}

async function mount(params: RootStackParamList['Contact Form']) {
  const props = {
    route: { params },
    navigation,
  } as unknown as React.ComponentProps<typeof ContactFormScreen>
  await act(async () => {
    root = create(<ContactFormScreen {...props} />)
  })
}

function addressProps() {
  return root.root.findByType(AddressSection).props as React.ComponentProps<
    typeof AddressSection
  >
}

async function save() {
  await act(async () => {
    const { header } = mocks.setOptions.mock.lastCall![0]
    await header({
      route: { params: { id: 'new-contact' } },
      navigation,
    }).props.rightElement.props.onPress()
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.contacts = []
  mocks.dataProtectionMode = false
})

afterEach(async () => {
  await act(async () => root.unmount())
})

describe('Contact Form map coordinates', () => {
  it('keeps the consent gate when creating from a map pin in data protection mode', async () => {
    mocks.dataProtectionMode = true
    const point = { latitude: 51.123456789, longitude: 0 }
    await mount({ id: 'new-contact', initialCoordinate: point })
    expect(root.root.findAllByType(AddressSection)).toHaveLength(0)
    await save()
    expect(root.root.findByType(ContactConsentSection).props.error).toBe(
      'dataProtectionConsentRequiredError'
    )
    expect(mocks.addContact).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()

    await act(async () => {
      root.root.findByType(ContactConsentSection).props.onConsentChange(true)
    })
    expect(addressProps().contact.coordinate).toEqual(point)
    await act(async () => {
      root.root
        .findByType(ContactIdentityCard)
        .props.onNameChange('New contact')
    })
    await save()
    expect(mocks.addContact).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        coordinate: point,
        userDraggedCoordinate: true,
      })
    )
    expect(mocks.geocode).not.toHaveBeenCalled()
  })

  it.each([
    { latitude: 0, longitude: -73.123456789 },
    { latitude: 40.123456789, longitude: 0 },
  ])(
    'prefills and saves the exact manual point %j without geocoding',
    async (point) => {
      await mount({ id: 'new-contact', initialCoordinate: point })
      expect(addressProps().contact.coordinate).toEqual(point)
      expect(addressProps().prefill.enabled).toBe(false)
      expect(addressProps().contact.address?.line1).toBe('')

      await act(async () => {
        root.root
          .findByType(ContactIdentityCard)
          .props.onNameChange('New contact')
      })
      await act(async () =>
        addressProps().setLine1('Address entered after pin')
      )
      await save()

      expect(mocks.addContact).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          coordinate: point,
          userDraggedCoordinate: true,
          name: 'New contact',
          address: expect.objectContaining({
            line1: 'Address entered after pin',
          }),
        })
      )
      expect(mocks.geocode).not.toHaveBeenCalled()
      expect(mocks.replace).toHaveBeenCalledWith(
        'Visit Form',
        expect.objectContaining({
          contactId: 'new-contact',
          fromContactForm: true,
        })
      )
    }
  )

  it('keeps the normal address prefill and geocoding flow for ordinary creation', async () => {
    await mount({ id: 'new-contact' })
    expect(addressProps().prefill.enabled).toBe(true)
    expect(addressProps().contact.address).toEqual(mocks.address)
    await act(async () => {
      root.root.findByType(ContactIdentityCard).props.onNameChange('Neighbor')
    })
    await save()
    expect(mocks.geocode).toHaveBeenCalledOnce()
    expect(mocks.updateContact).toHaveBeenCalledWith(
      expect.objectContaining({
        coordinate: { latitude: 12, longitude: 34 },
        userDraggedCoordinate: undefined,
      })
    )
  })

  it('does not write a contact when the prefilled form is abandoned', async () => {
    await mount({
      id: 'new-contact',
      initialCoordinate: { latitude: 0, longitude: 0 },
    })
    await act(async () => root.unmount())
    expect(mocks.addContact).not.toHaveBeenCalled()
    expect(mocks.updateContact).not.toHaveBeenCalled()
  })

  it('uses the saved contact when editing, even if an initial point is supplied', async () => {
    const existing: Contact = {
      id: 'existing',
      name: 'Existing',
      createdAt: new Date(),
      coordinate: { latitude: 51, longitude: -1 },
      userDraggedCoordinate: true,
    }
    mocks.contacts = [existing]
    await mount({
      id: 'existing',
      edit: true,
      initialCoordinate: { latitude: 0, longitude: 0 },
    })
    expect(addressProps().contact).toEqual(existing)
    expect(addressProps().prefill.enabled).toBe(false)
  })
})
