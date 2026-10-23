import { X as XIcon } from 'lucide-react-native'
import PinPickerMap from '@/components/PinPickerMap'
import Card from '@/components/ui/Card'
import Sheet from '@/components/ui/Sheet'
import { Region } from 'react-native-maps'
import { toast } from '@/stores/toasts'
import { Contact, Coordinate } from '@/types/contact'
import { useMemo, useState } from 'react'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import XView from '@/components/ui/layout/XView'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import { View } from 'react-native'
import IconButton from '@/components/ui/IconButton'
import InfoPopover from '@/components/ui/InfoPopover'
import useContacts from '@/stores/contactsStore'
import { ltrIsolate } from '@/lib/direction'

export default function PinLocation(props: {
  contact: Contact
  setContact: (value: React.SetStateAction<Contact>) => void
}) {
  const { contact, setContact } = props
  const { contacts } = useContacts()
  const [open, setOpen] = useState(false)
  const initialRegion: Region | undefined = contact.coordinate
    ? {
        latitude: contact.coordinate.latitude,
        longitude: contact.coordinate.longitude,
        latitudeDelta: 0.005,
        longitudeDelta: 0.005,
      }
    : undefined
  const [region, setRegion] = useState<Region | undefined>(initialRegion)
  const [coordinate, setCoordinate] = useState<Coordinate | undefined>(
    contact.coordinate
  )
  const theme = useTheme()

  function handleSave() {
    setContact({ ...contact, coordinate, userDraggedCoordinate: !!coordinate })
    toast.success(i18n.t('coordinateSaved'))
    setOpen(false)
  }

  function handleAddOrRemove() {
    if (region && !coordinate) {
      setCoordinate({ latitude: region.latitude, longitude: region.longitude })
    } else {
      setCoordinate(undefined)
    }
  }

  const otherContacts = useMemo(
    () =>
      contacts.flatMap((c) =>
        c.id !== contact.id && c.coordinate != null
          ? [{ id: c.id, coordinate: c.coordinate }]
          : []
      ),
    [contact.id, contacts]
  )

  return (
    <>
      <View
        style={{
          paddingVertical: 12,
          paddingHorizontal: 12,
        }}
      >
        <XView style={{ gap: 12, alignItems: 'center' }}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              gap: 4,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{
                  flexShrink: 1,
                  fontFamily: theme.fonts.medium,
                  fontSize: theme.fontSize('md'),
                  color: theme.colors.text,
                }}
              >
                {i18n.t('pinOnMap')}
              </Text>
              <InfoPopover
                title={i18n.t('pinOnMap')}
                description={
                  contact.coordinate
                    ? i18n.t('pinOnMap_customSet')
                    : i18n.t('pinOnMap_descriptionAuto')
                }
                inline
              />
            </View>
            {contact.coordinate && (
              <Text style={{ color: theme.colors.textAlt }}>
                {ltrIsolate(
                  i18n.t('pinCoordinates', {
                    latitude: contact.coordinate.latitude.toFixed(5),
                    longitude: contact.coordinate.longitude.toFixed(5),
                  })
                )}
              </Text>
            )}
          </View>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {contact.coordinate && (
              <Button
                variant='outline'
                style={{
                  minHeight: 44,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  justifyContent: 'center',
                  borderRadius: theme.numbers.borderRadiusSm,
                }}
                onPress={() => {
                  setCoordinate(undefined)
                  setContact({
                    ...contact,
                    coordinate: undefined,
                    userDraggedCoordinate: undefined,
                  })
                }}
              >
                <Text style={{ fontSize: theme.fontSize('sm') }}>
                  {i18n.t('clear')}
                </Text>
              </Button>
            )}
            <Button
              onPress={() => setOpen(true)}
              variant='outline'
              style={{
                minHeight: 44,
                paddingVertical: 6,
                paddingHorizontal: 14,
                justifyContent: 'center',
                borderRadius: theme.numbers.borderRadiusSm,
              }}
            >
              <Text style={{ fontSize: theme.fontSize('sm') }}>
                {i18n.t(contact.coordinate ? 'edit' : 'add')}
              </Text>
            </Button>
          </View>
        </XView>
      </View>
      <Sheet open={open} onOpenChange={setOpen} snapPoints={['full']}>
        <XView
          style={{
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            paddingVertical: 15,
            paddingHorizontal: 20,
            gap: 10,
          }}
        >
          <Text style={{ fontSize: theme.fontSize('md'), flex: 1 }}>
            {i18n.t('pinLocationHelp')}
          </Text>
          <IconButton
            noTransform
            icon={XIcon}
            color={theme.colors.text}
            onPress={() => setOpen(false)}
            size={'lg'}
          />
        </XView>
        <View
          style={{
            position: 'relative',
            flex: 1,
          }}
        >
          <PinPickerMap
            coordinate={coordinate}
            onChange={setCoordinate}
            onRegionChange={setRegion}
            otherPins={otherContacts}
            pinId={contact.id}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              width: '100%',
              padding: 5,
            }}
          >
            <Card
              style={{
                flexDirection: 'row',
                gap: 5,
                borderRadius: theme.numbers.borderRadiusMd,
                paddingVertical: 10,
                paddingHorizontal: 10,
              }}
            >
              <Button
                noTransform
                variant='outline'
                style={{
                  justifyContent: 'center',
                  flex: 1,
                  paddingVertical: 10,
                }}
                onPress={handleAddOrRemove}
              >
                <Text>{i18n.t(coordinate ? 'remove' : 'add')}</Text>
              </Button>
              <Button
                noTransform
                variant='solid'
                style={{
                  justifyContent: 'center',
                  flex: 1,
                  backgroundColor: theme.colors.accent,
                  paddingVertical: 10,
                }}
                onPress={handleSave}
              >
                <Text
                  style={{
                    fontFamily: theme.fonts.semiBold,
                    color: theme.colors.textInverse,
                  }}
                >
                  {i18n.t('save')}
                </Text>
              </Button>
            </Card>
          </View>
        </View>
      </Sheet>
    </>
  )
}
