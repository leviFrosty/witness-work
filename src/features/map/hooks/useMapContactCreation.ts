import { useEffect, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import { useShallow } from 'zustand/react/shallow'
import useReverseGeocodePin, {
  type ReverseGeocodeStatus,
} from '@/hooks/useReverseGeocodePin'
import Haptics from '@/lib/haptics'
import { isContactDismissed } from '@/lib/dismissedContacts'
import type { ReverseGeocodeResult } from '@/lib/reverseGeocode'
import useContacts from '@/stores/contactsStore'
import { usePreferences } from '@/stores/preferences'
import { Coordinate } from '@/types/contact'
import { RootStackNavigation } from '@/types/rootStack'

export type PinAddressLookup = {
  enabled: boolean
  canToggle: boolean
  setEnabled: (enabled: boolean) => void
  status: ReverseGeocodeStatus
  result: ReverseGeocodeResult | null
}

export default function useMapContactCreation(
  onContactCreated: (id: string, coordinate: Coordinate) => void
) {
  const navigation = useNavigation<RootStackNavigation>()
  const [coordinate, setCoordinate] = useState<Coordinate>()
  const pendingContactId = useRef<string | undefined>(undefined)

  const { autoLookupPinAddress, dataProtectionMode, setPreferences } =
    usePreferences(
      useShallow((s) => ({
        autoLookupPinAddress: s.autoLookupPinAddress,
        dataProtectionMode: s.dataProtectionMode,
        setPreferences: s.set,
      }))
    )

  const lookupEnabled = autoLookupPinAddress && !dataProtectionMode
  const lookup = useReverseGeocodePin({
    coordinate,
    enabled: lookupEnabled,
  })

  useEffect(
    () => navigation.addListener('blur', () => setCoordinate(undefined)),
    [navigation]
  )

  useEffect(
    () =>
      navigation.addListener('focus', () => {
        const id = pendingContactId.current
        if (!id) return
        pendingContactId.current = undefined

        const contact = useContacts.getState().contacts.find((c) => c.id === id)
        if (!contact?.coordinate || isContactDismissed(contact)) return
        onContactCreated(contact.id, contact.coordinate)
      }),
    [navigation, onContactCreated]
  )

  const dropPin = (point: Coordinate) => {
    setCoordinate(point)
    Haptics.light()
  }

  const cancel = () => setCoordinate(undefined)

  const createContact = () => {
    if (!coordinate) return
    const id = Crypto.randomUUID()
    pendingContactId.current = id
    const initialAddress = lookupEnabled ? lookup.result?.address : undefined
    setCoordinate(undefined)
    navigation.navigate('Contact Form', {
      id,
      initialCoordinate: coordinate,
      ...(initialAddress ? { initialAddress } : {}),
    })
  }

  const addressLookup: PinAddressLookup = {
    enabled: lookupEnabled,
    canToggle: !dataProtectionMode,
    setEnabled: (enabled) => setPreferences({ autoLookupPinAddress: enabled }),
    status: lookup.status,
    result: lookup.result,
  }

  return { coordinate, dropPin, cancel, createContact, addressLookup }
}
