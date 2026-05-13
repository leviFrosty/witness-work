import { ConfettiConfig } from '@/vendor/ConfettiSkia/core/Config'
import Random from '@/vendor/ConfettiSkia/core/Random'
import Vector2D from '@/vendor/ConfettiSkia/core/Vector2D'

export interface DrawContext {
  drawRect(
    position: Vector2D,
    size: Vector2D,
    rotation: number,
    hue: number,
    opacity: number
  ): void
}

export interface CullContext {
  height: number
}

export default class Particle {
  private config: ConfettiConfig
  private position: Vector2D
  private size: Vector2D
  private velocity: Vector2D
  private rotation: number
  private rotationSpeed: number
  private hue: number
  private opacity: number
  private fadeRate: number

  constructor(config: ConfettiConfig) {
    this.config = config
    this.position = this.initPosition()
    this.size = this.initSize()
    this.velocity = this.initVelocity()
    this.rotation = Random.range(0, 360)
    this.rotationSpeed = Random.range(-250, 250)
    this.hue = Random.range(0, 360)
    this.opacity = 100
    this.fadeRate = 100 / Random.range(0.5, 2.5)
  }

  private initPosition(): Vector2D {
    const x = this.config.position.x
    const y = this.config.position.y
    return new Vector2D(x, y)
  }

  private initSize(): Vector2D {
    const x = Random.range(2, 10) * this.config.size
    const y = Random.range(2, 4) * this.config.size
    return new Vector2D(x, y)
  }

  private initVelocity(): Vector2D {
    const x = Random.range(-0.5, 0.5)
    const y = Random.range(-0.75, 0.25)
    const direction = new Vector2D(x, y).normalize()
    direction.x *= Random.range(0, this.config.velocity * 4)
    direction.y *= Random.range(0, this.config.velocity * 4)
    return direction
  }

  update(delta: number): void {
    this.velocity.x += Random.range(-350, 350) * delta
    this.velocity.y += 750 * (this.size.y / (10 * this.config.size)) * delta

    const damping = Math.pow(0.98, delta * 60)
    this.velocity.scale(damping)

    this.position.x += this.velocity.x * delta
    this.position.y += this.velocity.y * delta

    this.rotation += this.rotationSpeed * delta

    if (this.config.fade) {
      this.opacity -= this.fadeRate * delta
      if (this.opacity < 0) this.opacity = 0
    }
  }

  draw(ctx: DrawContext): void {
    ctx.drawRect(
      this.position,
      this.size,
      this.rotation,
      this.hue,
      this.opacity
    )
  }

  cull(ctx: CullContext): boolean {
    const padding = Math.max(this.size.x, this.size.y) * 2
    const offScreen = this.position.y > ctx.height + padding
    return offScreen || this.opacity <= 0
  }
}
