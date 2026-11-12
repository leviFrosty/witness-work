import { useState } from 'react'
import { Alert, Image, View } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import {
  Camera as CameraIcon,
  Image as ImageIcon,
  RefreshCw as ReplaceIcon,
  Trash2 as TrashIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { hasCapability } from '@/lib/platformCapabilities'
import TerritoryMapRow from '@/features/territories/components/TerritoryMapRow'
import { cardPhotoUri } from '@/features/territories/lib/cardPhoto'

const OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  quality: 0.7,
  exif: false,
}

const THUMBNAIL = 32

const takePhoto = async () => {
  let permission = await ImagePicker.getCameraPermissionsAsync()
  if (!permission.granted && permission.canAskAgain)
    permission = await ImagePicker.requestCameraPermissionsAsync()
  if (!permission.granted) return null
  return ImagePicker.launchCameraAsync(OPTIONS)
}

export default function TerritoryCardPhotoRow({
  photo,
  onPick,
  onRemove,
}: {
  photo: string | undefined

  onPick: (uri: string) => void
  onRemove: () => void
}) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const camera = hasCapability('camera')

  const pick = async (source: 'camera' | 'library') => {
    const result =
      source === 'camera'
        ? await takePhoto()
        : await ImagePicker.launchImageLibraryAsync(OPTIONS)
    const uri = result && !result.canceled ? result.assets[0]?.uri : undefined
    if (uri) onPick(uri)
  }

  const replace = () => {
    if (!camera) return void pick('library')
    Alert.alert(i18n.t('territories.cardPhoto'), undefined, [
      {
        text: i18n.t('territories.takePhoto'),
        onPress: () => void pick('camera'),
      },
      {
        text: i18n.t('territories.choosePhoto'),
        onPress: () => void pick('library'),
      },
      { text: i18n.t('cancel'), style: 'cancel' },
    ])
  }

  const action = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string,
    color = theme.colors.text
  ) => (
    <Button
      variant='outline'
      onPress={onPress}
      testID={testID}
      style={{
        flex: 1,
        minHeight: 44,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        borderRadius: 22,
      }}
    >
      <LucideIcon icon={icon} size={16} color={color} />
      <Text style={{ fontFamily: theme.fonts.semiBold, color }}>{label}</Text>
    </Button>
  )

  return (
    <View>
      <TerritoryMapRow
        icon={CameraIcon}
        label={i18n.t('territories.map.cardPhotoRow')}
        sublabel={
          photo ? undefined : i18n.t('territories.addCardPhoto_description')
        }
        done={!!photo}
        preview={
          photo && !open ? (
            <Image
              source={{ uri: cardPhotoUri(photo) }}
              resizeMode='cover'
              accessibilityIgnoresInvertColors
              style={{
                width: THUMBNAIL,
                height: THUMBNAIL,
                borderRadius: 8,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            />
          ) : undefined
        }
        opens={open ? 'expanded' : 'collapsed'}
        onPress={() => setOpen((value) => !value)}
        lastInSection={!open}
        testID='territory-photo-row'
      />
      {open && (
        <View
          testID='territory-photo-panel'
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingTop: 12,
            paddingBottom: inputLayout.horizontalPadding,
            gap: 12,
          }}
        >
          {photo && (
            <Image
              source={{ uri: cardPhotoUri(photo) }}
              accessibilityLabel={i18n.t('territories.cardPhoto')}
              resizeMode='cover'
              style={{
                width: '100%',
                aspectRatio: 3 / 2,
                borderRadius:
                  inputLayout.sectionRadius - inputLayout.horizontalPadding,
                backgroundColor: theme.colors.backgroundLighter,
              }}
            />
          )}
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {photo ? (
              <>
                {action(
                  ReplaceIcon,
                  i18n.t('territories.replacePhoto'),
                  replace,
                  'territory-photo-replace'
                )}
                {action(
                  TrashIcon,
                  i18n.t('remove'),
                  onRemove,
                  'territory-photo-remove',
                  theme.colors.error
                )}
              </>
            ) : (
              <>
                {camera &&
                  action(
                    CameraIcon,
                    i18n.t('territories.takePhoto'),
                    () => void pick('camera'),
                    'territory-photo-take'
                  )}
                {action(
                  ImageIcon,
                  i18n.t('territories.choosePhoto'),
                  () => void pick('library'),
                  'territory-photo-choose'
                )}
              </>
            )}
          </View>
        </View>
      )}
    </View>
  )
}
