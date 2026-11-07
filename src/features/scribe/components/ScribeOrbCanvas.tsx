import type { ComponentProps, ReactNode } from 'react'
import { Canvas, Fill, Shader } from '@shopify/react-native-skia'
import { orbShader } from '@/features/scribe/shaders/orbShader'

interface Props {
  size: number
  uniforms: ComponentProps<typeof Shader>['uniforms']

  fallback: ReactNode
}

export default function ScribeOrbCanvas({ size, uniforms, fallback }: Props) {
  if (!orbShader) return fallback
  return (
    <Canvas style={{ width: size, height: size }}>
      <Fill>
        <Shader source={orbShader} uniforms={uniforms} />
      </Fill>
    </Canvas>
  )
}
