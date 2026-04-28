export interface ConfettiConfig {
  position: { x: number; y: number }
  count: number
  size: number
  velocity: number
  fade: boolean
}

export interface Viewport {
  width: number
  height: number
}

const DEFAULT_CONFIG = {
  count: 75,
  size: 1,
  velocity: 200,
  fade: false,
}

export default class Config {
  static init(
    config: Partial<ConfettiConfig>,
    viewport: Viewport
  ): ConfettiConfig {
    return {
      position: { x: viewport.width / 2, y: viewport.height / 3 },
      ...DEFAULT_CONFIG,
      ...config,
    }
  }
}
