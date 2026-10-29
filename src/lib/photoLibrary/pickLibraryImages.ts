import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

/** What the limited-access picker is asked for. */
export type SharedPhotoRequest = {
  /** The most photos the User can pick. At 1, tapping a photo picks it. */
  selectionLimit: number
  /** Include each photo's EXIF, shaped like the system picker's. */
  exif: boolean
}

/** Shows the limited-access picker: the picked photos' copies, or null. */
export type ChooseSharedPhotos = (
  request: SharedPhotoRequest
) => Promise<ImagePicker.ImagePickerAsset[] | null>

/**
 * Picks photos from the library. Normally that's the system picker, which needs
 * no library access. When the User shared only some photos with the app (iOS
 * limited access), it's the app's own picker (`chooseShared`) instead: it shows
 * just those photos and lets the User change which ones are shared. The system
 * picker would show the whole library.
 */
export async function pickLibraryImages(
  options: ImagePicker.ImagePickerOptions,
  chooseShared: ChooseSharedPhotos
): Promise<ImagePicker.ImagePickerResult> {
  if (Platform.OS === 'ios') {
    const permission = await ImagePicker.getMediaLibraryPermissionsAsync()
    if (permission.accessPrivileges === 'limited') {
      const assets = await chooseShared({
        selectionLimit: options.allowsMultipleSelection
          ? options.selectionLimit || Infinity
          : 1,
        exif: options.exif ?? false,
      })
      return assets?.length
        ? { canceled: false, assets }
        : { canceled: true, assets: null }
    }
  }
  return ImagePicker.launchImageLibraryAsync(options)
}
