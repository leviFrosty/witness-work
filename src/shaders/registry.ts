import HolographicShader from './HolographicShader'
import type { ShaderDefinition, ShaderId } from './types'

const NoneShader = () => null

/**
 * Single source of truth for available profile-card shaders.
 *
 * Ordering here controls the order in selection UIs. To add a new shader:
 *
 * 1. Extend the `ShaderId` union in `./types.ts`.
 * 2. Add a component (see `HolographicShader.tsx` as a template).
 * 3. Register it below with its i18n keys and optional `locked: true` if it should
 *    stay hidden until the user unlocks it via supporter/progression.
 */
export const shaderRegistry: Record<ShaderId, ShaderDefinition> = {
  holographic: {
    id: 'holographic',
    labelKey: 'shaderHolographic',
    descriptionKey: 'shaderHolographic_description',
    Component: HolographicShader,
  },
  none: {
    id: 'none',
    labelKey: 'shaderNone',
    descriptionKey: 'shaderNone_description',
    Component: NoneShader,
  },
}

export const DEFAULT_SHADER_ID: ShaderId = 'holographic'

/**
 * Returns the definition for `id`, falling back to the default shader when an
 * unknown id is persisted (e.g. after a shader is removed in a future build).
 */
export const getShader = (id: ShaderId): ShaderDefinition =>
  shaderRegistry[id] ?? shaderRegistry[DEFAULT_SHADER_ID]

/**
 * Lists shaders for selection UIs. Locked shaders are omitted by default; pass
 * `includeLocked: true` to surface everything (e.g. for a debug picker or a
 * "locked / unlocked" preview grid).
 */
export const listShaders = (opts?: {
  includeLocked?: boolean
}): ShaderDefinition[] =>
  Object.values(shaderRegistry).filter((s) => opts?.includeLocked || !s.locked)
