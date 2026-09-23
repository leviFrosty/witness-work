import { useEffect, useRef, useState } from 'react'
import { useNavigation } from '@react-navigation/native'
import * as Crypto from 'expo-crypto'
import Haptics from '@/lib/haptics'
import { isContactDismissed } from '@/lib/dismissedContacts'
import useContacts from '@/stores/contactsStore'
import { Coordinate } from '@/types/contact'
import { RootStackNavigation } from '@/types/rootStack'

export default function useMapContactCreation(
  onContactCreated: (id: string, coordinate: Coordinate) => void
) {
  const navigation = useNavigation<RootStackNavigation>()
  const [coordinate, setCoordinate] = useState<Coordinate>()
  const pendingContactId = useRef<string | undefined>(undefined)

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

        // Read the saved record on return: the forms may have changed its pin,
        // or the user may have abandoned creation or deleted the Contact.
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
    setCoordinate(undefined)
    navigation.navigate('Contact Form', {
      id,
      initialCoordinate: coordinate,
    })
  }

  return { coordinate, dropPin, cancel, createContact }
}
