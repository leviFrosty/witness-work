/**
 * Scene geometry. The room is a 180 × 100 logical-pixel scene, origin top left,
 * x right, y down:
 *
 * - Back wall y 0–51 (crown moulding y 0–6), wainscot y 52–61, floor y 62–99;
 * - Window frame x 14–59, y 8–47, glass x 16–57, y 10–43 with a cross bar at x
 *   36–37 and y 26–27;
 * - The pet's 32 × 32 sprite has its top-left at ({@link PET_X}, {@link PET_Y});
 * - Visiting pets sit at {@link VISITOR_SPOTS}, mirrored.
 *
 * Views crop this scene; see the `VIEW_*` viewports.
 */
import { crop, type PixelBuffer, type Viewport } from '@/lib/pixelArt'

/** Scene width in logical pixels. */
export const SCENE_W = 180
/** Scene height in logical pixels. */
export const SCENE_H = 100
/** Pet sprite size (square). */
export const SPRITE_SIZE = 32
/** Pet sprite top-left x. */
export const PET_X = 52
/** Pet sprite top-left y. */
export const PET_Y = 52
/**
 * Where the pet's body sits in `viewport`, as fractions of its width and
 * height: where what it earns flies out from.
 */
export const petCenterIn = (viewport: Viewport): [number, number] => [
  (PET_X + SPRITE_SIZE / 2 - viewport[0]) / viewport[2],
  (PET_Y + SPRITE_SIZE / 2 + 2 - viewport[1]) / viewport[3],
]

/**
 * Visiting pets' sprite top-lefts, in the order they take them: either side of
 * the pet, then rows further back around it, then outward. Every spot is behind
 * the pet ({@link PET_Y} or higher), so it stays in front, and the first ones
 * keep clear of the lamp (x 112 on). Twenty fill the room on purpose.
 */
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

/** The whole scene. */
export const VIEW_FULL: Viewport = [0, 0, SCENE_W, SCENE_H]
/** Home card: window, pet, lamp and sign. */
export const VIEW_CARD: Viewport = [22, 8, 146, 90]
/** Square around the pet (small widget, avatar). */
export const VIEW_PET_SQUARE: Viewport = [38, 40, 60, 60]
/** Large widget: pet, lamp and sign, full height. */
export const VIEW_WIDGET_LARGE: Viewport = [38, 0, 123, 100]
/** The wall sign with a little wall around it. */
export const VIEW_SIGN: Viewport = [118, 4, 62, 46]

/** Named viewports, for pickers and dev tools. */
export const VIEWPORTS = {
  full: VIEW_FULL,
  card: VIEW_CARD,
  petSquare: VIEW_PET_SQUARE,
  widgetLarge: VIEW_WIDGET_LARGE,
  sign: VIEW_SIGN,
} as const satisfies Record<string, Viewport>

export type ViewportName = keyof typeof VIEWPORTS

/** `scene` cropped to a named or explicit viewport. */
export function cropScene(
  scene: PixelBuffer,
  view: ViewportName | Viewport
): PixelBuffer {
  return crop(scene, typeof view === 'string' ? VIEWPORTS[view] : view)
}
