import { getShader } from '@/shaders/registry'
import type { ShaderId, TiltShaderContext } from '@/shaders/types'

interface Props extends TiltShaderContext {
  shaderId: ShaderId
  /**
   * When false, renders nothing. Callers don't need to short-circuit
   * themselves.
   */
  enabled: boolean
}

/**
 * Thin switcher over `shaderRegistry`. Keeps `TiltableCard` (and any future
 * host) unaware of which shaders exist — it just hands off the tilt context.
 */
const ShaderOverlay = ({ shaderId, enabled, ...ctx }: Props) => {
  if (!enabled) return null
  const { Component } = getShader(shaderId)
  return <Component {...ctx} />
}

export default ShaderOverlay
