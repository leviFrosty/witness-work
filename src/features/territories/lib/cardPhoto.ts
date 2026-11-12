import * as FileSystem from 'expo-file-system/legacy'

const FOLDER = 'territory-cards/'

const folder = () =>
  FileSystem.documentDirectory
    ? `${FileSystem.documentDirectory}${FOLDER}`
    : null

export const cardPhotoUri = (photo: string): string => {
  const base = folder()
  return base && !photo.includes('/') ? `${base}${photo}` : photo
}

export const saveCardPhoto = async (
  sourceUri: string,
  territoryId: string
): Promise<string> => {
  const base = folder()
  if (!base) return sourceUri
  await FileSystem.makeDirectoryAsync(base, { intermediates: true })
  const name = `${territoryId}-${Date.now()}.jpg`
  await FileSystem.copyAsync({ from: sourceUri, to: `${base}${name}` })
  return name
}

export const deleteCardPhoto = async (photo: string | undefined) => {
  if (!photo || photo.includes('/') || !folder()) return
  await FileSystem.deleteAsync(cardPhotoUri(photo), { idempotent: true })
}
