/**
 * Scene geometry. The room is a 180 × 100 logical-pixel scene, origin top left,
 * x right, y down:
 *
 * - Back wall y 0–51 (crown moulding y 0–6), wainscot y 52–61, floor y 62–99;
 * - Window frame x 14–59, y 8–47, glass x 16–57, y 10–43 with a cross bar at x
 *   36–37 and y 26–27;
 * - The pet's 32 × 32 sprite has its top-left at ({@link PET_X}, {@link PET_Y});
 * - A visitor pet sits at ({@link VISITOR_X}, {@link PET_Y}), mirrored.
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
/** Visitor sprite top-left x. */
export const VISITOR_X = 86

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
