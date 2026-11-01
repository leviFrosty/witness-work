import { Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'

export type SharedPhotoRequest = {
  selectionLimit: number

  exif: boolean
}

export type ChooseSharedPhotos = (
  request: SharedPhotoRequest
) => Promise<ImagePicker.ImagePickerAsset[] | null>

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
