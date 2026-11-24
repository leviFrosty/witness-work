import * as Linking from 'expo-linking'

export const openExternalUrl = async (url: string): Promise<void> => {
  await Linking.openURL(url)
}
