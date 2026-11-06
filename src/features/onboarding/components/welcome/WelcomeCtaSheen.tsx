import type { ComponentProps } from 'react'
import {
  Canvas,
  Group,
  LinearGradient,
  Rect,
  vec,
} from '@shopify/react-native-skia'

interface Props {
  /** The button's size. */
  width: number
  height: number
  sheenWidth: number
  /** Moves the sheen across. */
  transform: ComponentProps<typeof Group>['transform']
}

/** `WelcomeCta`'s passing sheen, in its own module so Skia loads with it. */
export default function WelcomeCtaSheen({
  width,
  height,
  sheenWidth,
  transform,
}: Props) {
  return (
    <Canvas
      pointerEvents='none'
      style={{ position: 'absolute', left: 0, top: 0, width, height }}
    >
      <Group transform={transform}>
        <Rect x={0} y={0} width={sheenWidth} height={height}>
          <LinearGradient
            start={vec(0, 0)}
            end={vec(sheenWidth, 0)}
            colors={[
              'rgba(255,255,255,0)',
              'rgba(255,255,255,0.4)',
              'rgba(255,255,255,0)',
            ]}
          />
        </Rect>
      </Group>
    </Canvas>
  )
}
