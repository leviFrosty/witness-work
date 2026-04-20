import type { ComponentType } from 'react'
import type { SharedValue } from 'react-native-reanimated'

/**
 * Inputs every tilt-driven shader consumes. Provided by the host component
 * (currently `TiltableCard`) and passed into each shader's render component.
 *
 * Keeping this context generic lets us swap shaders freely without teaching
 * every new effect how to read tilt or its container size.
 */
export type TiltShaderContext = {
  width: SharedValue<number>
  height: SharedValue<number>
  /**
   * Horizontal tilt normalized to roughly [-1, 1]. Positive = tilted toward the
   * right edge. Combines touch drag and accelerometer.
   */
  tiltX: SharedValue<number>
  /**
   * Vertical tilt normalized to roughly [-1, 1]. Positive = tilted toward the
   * bottom edge.
   */
  tiltY: SharedValue<number>
  /** Border radius used to mask the overlay to the card's rounded shape. */
  borderRadius: number
}

/**
 * Every available profile-card shader. Adding a new effect is two steps:
 *
 * 1. Add its id here (keeps the type exhaustive + preferences type-safe).
 * 2. Register a definition in `registry.ts`.
 */
export type ShaderId = 'none' | 'holographic'

export type ShaderDefinition = {
  id: ShaderId
  /** I18n key for the display name in selection UIs. */
  labelKey: string
  /** I18n key for a short description. */
  descriptionKey?: string
  /**
   * When true, the shader is hidden from default selection lists until the user
   * unlocks it. Reserved for future progression / supporter unlocks — consumers
   * should still be able to opt-in to include locked entries (e.g. an
   * admin/debug picker) via `listShaders({ includeLocked: true })`.
   */
  locked?: boolean
  /**
   * Overlay component. Should render a Skia canvas sized and masked to the
   * provided `width` × `height` + `borderRadius`. `none` uses a no-op component
   * so callers never have to special-case "disabled" vs "missing".
   */
  Component: ComponentType<TiltShaderContext>
}
