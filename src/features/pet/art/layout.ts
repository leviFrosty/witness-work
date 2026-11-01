import { crop, type PixelBuffer, type Viewport } from '@/lib/pixelArt'

export const SCENE_W = 180

export const SCENE_H = 100

export const SPRITE_SIZE = 32

export const PET_X = 52

export const PET_Y = 52

export const petCenterIn = (viewport: Viewport): [number, number] => [
  (PET_X + SPRITE_SIZE / 2 - viewport[0]) / viewport[2],
  (PET_Y + SPRITE_SIZE / 2 + 2 - viewport[1]) / viewport[3],
]

export const VISITOR_SPOTS: readonly (readonly [number, number])[] = [
  [82, 50],
  [24, 50],
  [66, 42],
  [40, 42],
  [92, 42],
  [52, 34],
  [80, 34],
  [26, 34],
  [66, 26],
  [38, 26],
  [94, 26],
  [12, 42],
  [104, 50],
  [12, 26],
  [106, 34],
  [52, 18],
  [80, 18],
  [24, 18],
  [120, 42],
  [108, 18],
]

export const VIEW_FULL: Viewport = [0, 0, SCENE_W, SCENE_H]

export const VIEW_CARD: Viewport = [22, 8, 146, 90]

export const VIEW_PET_SQUARE: Viewport = [38, 40, 60, 60]

export const VIEW_WIDGET_LARGE: Viewport = [38, 0, 123, 100]

export const VIEW_SIGN: Viewport = [118, 4, 62, 46]

export const VIEWPORTS = {
  full: VIEW_FULL,
  card: VIEW_CARD,
  petSquare: VIEW_PET_SQUARE,
  widgetLarge: VIEW_WIDGET_LARGE,
  sign: VIEW_SIGN,
} as const satisfies Record<string, Viewport>

export type ViewportName = keyof typeof VIEWPORTS

export function cropScene(
  scene: PixelBuffer,
  view: ViewportName | Viewport
): PixelBuffer {
  return crop(scene, typeof view === 'string' ? VIEWPORTS[view] : view)
}
