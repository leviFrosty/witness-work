import { I18nManager } from 'react-native'

export function isRtlLayout(): boolean {
  return I18nManager?.isRTL === true
}

export function forwardSign(): 1 | -1 {
  return isRtlLayout() ? -1 : 1
}

export function flowScrollX(
  x: number,
  contentWidth: number,
  viewportWidth: number,
  rtl: boolean
): number {
  'worklet'
  if (!rtl) return x
  return Math.max(0, contentWidth - viewportWidth - x)
}

export type FlowAlign = 'start' | 'end'

export function alignText(align: FlowAlign): 'left' | 'right' {
  return align === 'start' ? 'left' : 'right'
}

export function alignInput(align: FlowAlign): 'left' | 'right' {
  const start = isRtlLayout() ? 'right' : 'left'
  const end = start === 'left' ? 'right' : 'left'
  return align === 'start' ? start : end
}

export function leftForPhysicalX(
  x: number,
  width: number,
  containerWidth: number
): number {
  return isRtlLayout() ? containerWidth - x - width : x
}

export const LTR_ISOLATE = '⁦'

export const POP_ISOLATE = '⁩'

export function ltrIsolate(text: string): string {
  return `${LTR_ISOLATE}${text}${POP_ISOLATE}`
}
