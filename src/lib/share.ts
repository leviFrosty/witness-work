import { Platform, Share } from 'react-native'

/** Android shares text; iOS uses a URL item to retain its rich link preview. */
export const shareUrl = (url: string, title?: string) =>
  Share.share(Platform.OS === 'ios' ? { url, title } : { message: url, title })
