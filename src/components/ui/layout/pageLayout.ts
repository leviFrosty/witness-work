import type { ViewStyle } from 'react-native'
import { CONTENT_MAX_WIDTH } from '@/lib/sidebarLayout'

export const pageLayout = {
  maxWidth: CONTENT_MAX_WIDTH,
  inset: 24,
  columnMaxWidth: 720,
} as const

export const pageFrame = {
  width: '100%',
  maxWidth: pageLayout.maxWidth,
  alignSelf: 'center',
} as const satisfies ViewStyle

export const pageFrameInset = {
  ...pageFrame,
  paddingHorizontal: pageLayout.inset,
} as const satisfies ViewStyle
