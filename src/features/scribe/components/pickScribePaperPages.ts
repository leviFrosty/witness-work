import * as ImagePicker from 'expo-image-picker'
import { SCRIBE_PAPER_MAX_PAGES } from '@/features/scribe/constants'
import type { ScribePaperPage } from '@/features/scribe/types'

/**
 * Photos of paper pages, in the order picked, for onboarding's Import from
 * Paper (`ScribeConversation { paperPages }`). Null when cancelled.
 */
export async function pickScribePaperPages(): Promise<
  ScribePaperPage[] | null
> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: true,
    selectionLimit: SCRIBE_PAPER_MAX_PAGES,
    orderedSelection: true,
    quality: 1,
    exif: false,
  })
  if (result.canceled || !result.assets.length) return null
  return result.assets
    .slice(0, SCRIBE_PAPER_MAX_PAGES)
    .map(({ uri, width, height }) => ({ uri, width, height }))
}
