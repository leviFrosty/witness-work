import type {
  SkCanvas,
  SkPaint,
  Skia as SkiaApi,
} from '@shopify/react-native-skia'
import { confettiColor } from './color'
import type { DrawContext } from './Particle'
import Vector2D from './Vector2D'

export default class SkiaRenderer implements DrawContext {
  private canvas: SkCanvas
  private paint: SkPaint
  private Skia: typeof SkiaApi

  constructor(canvas: SkCanvas, paint: SkPaint, Skia: typeof SkiaApi) {
    this.canvas = canvas
    this.paint = paint
    this.Skia = Skia
  }

  drawRect(
    position: Vector2D,
    size: Vector2D,
    rotation: number,
    hue: number,
    opacity: number
  ): void {
    const { r, g, b, a } = confettiColor(hue, opacity)
    this.paint.setColor(
      this.Skia.Color(
        `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
      )
    )

    this.canvas.save()
    this.canvas.translate(position.x, position.y)
    this.canvas.rotate(rotation, 0, 0)
    this.canvas.drawRect(
      this.Skia.XYWHRect(-size.x / 2, -size.y / 2, size.x, size.y),
      this.paint
    )
    this.canvas.restore()
  }
}
