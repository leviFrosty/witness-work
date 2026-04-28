import type { ConfettiConfig } from './Config'
import Particle, { CullContext, DrawContext } from './Particle'

export default class Engine {
  private particles: Particle[] = []

  trigger(config: ConfettiConfig): void {
    for (let i = 0; i < config.count; i++) {
      this.particles.push(new Particle(config))
    }
  }

  step(delta: number, cullCtx: CullContext): void {
    const clampedDelta = Math.min(delta, 0.064)

    let write = 0
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i]
      p.update(clampedDelta)
      if (!p.cull(cullCtx)) {
        this.particles[write++] = p
      }
    }
    this.particles.length = write
  }

  draw(ctx: DrawContext): void {
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].draw(ctx)
    }
  }

  get count(): number {
    return this.particles.length
  }

  clear(): void {
    this.particles.length = 0
  }
}
