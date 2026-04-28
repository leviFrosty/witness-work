export default class Vector2D {
  x: number
  y: number

  constructor(x: number = 0, y: number = 0) {
    this.x = x
    this.y = y
  }

  copy(): Vector2D {
    return new Vector2D(this.x, this.y)
  }

  magnitude(): number {
    return Math.hypot(this.x, this.y)
  }

  normalize(): Vector2D {
    const mag = this.magnitude()
    if (mag === 0) {
      this.x = 0
      this.y = 0
      return this
    }
    const inv = 1 / mag
    this.x *= inv
    this.y *= inv
    return this
  }

  scale(s: number): Vector2D {
    this.x *= s
    this.y *= s
    return this
  }
}
