import { Platform, Share } from 'react-native'

export const shareUrl = (url: string, title?: string) =>
  Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title })
