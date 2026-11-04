import { Platform, Share } from 'react-native'

/**
 * Android shares text; iOS uses a URL item to retain its rich link preview, and
 * so does the web, whose share sheet takes a URL of its own.
 */
export const shareUrl = (url: string, title?: string) =>
  Share.share(
    Platform.select({
      android: { message: url, title },
      default: { url, title },
    })
  )
