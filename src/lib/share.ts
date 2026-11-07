import { Platform, Share } from 'react-native'

export const shareUrl = (url: string, title?: string) =>
  Share.share(
    Platform.select({
      android: { message: url, title },
      default: { url, title },
    })
  )
