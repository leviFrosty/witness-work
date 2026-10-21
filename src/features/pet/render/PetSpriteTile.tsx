import { useEffect } from 'react'
import { PixelRatio } from 'react-native'
import {
  Canvas,
  FilterMode,
  Image,
  MipmapMode,
  type SkImage,
} from '@shopify/react-native-skia'
import { useReducedMotion, useSharedValue } from 'react-native-reanimated'
import { createLru } from '@/lib/pixelArt'
import type { PetSpecies } from '@/types/pet'
import {
  idlePose,
  petSprite,
  spriteKey,
  SPRITE_SIZE,
  type PetMood,
  type SpriteKey,
} from '@/features/pet/art'
import { crispScale } from '@/features/pet/render/crispScale'
import { PET_FPS } from '@/features/pet/render/frameLoop'
import { bufferToSkImage } from '@/features/pet/render/skiaImage'
import useSceneActive from '@/features/pet/render/useSceneActive'

const SAMPLING = { filter: FilterMode.Nearest, mipmap: MipmapMode.None }

// A handful of idle frames per species and coat; kept, not re-uploaded.
const images = createLru<SkImage | null>(160)

function spriteImage(
  species: PetSpecies,
  coat: string,
  key: SpriteKey
): SkImage | null {
  return images.getOrCreate(spriteKey(species, coat, key), () =>
    bufferToSkImage(petSprite(species, coat, key))
  )
}

// One clock for every tile on screen.
const tiles = new Set<(tMs: number) => void>()
let clock: ReturnType<typeof setInterval> | null = null
function subscribe(tick: (tMs: number) => void): () => void {
  tiles.add(tick)
  clock ??= setInterval(() => {
    const t = performance.now()
    tiles.forEach((fn) => fn(t))
  }, 1000 / PET_FPS)
  return () => {
    tiles.delete(tick)
    if (tiles.size === 0 && clock !== null) {
      clearInterval(clock)
      clock = null
    }
  }
}

function frameKey(mood: PetMood, tMs: number, seed: number): SpriteKey {
  const idle = idlePose(mood, tMs, seed)
  return { ...idle, lie: idle.lie, flip: false }
}

/**
 * One pet's 32 × 32 sprite, idling (bob, wag, blink), at a size that keeps its
 * pixels square. Still with Reduce Motion or off screen.
 */
export default function PetSpriteTile({
  species,
  coat,
  size,
  mood = 'happy',
  seed = 0,
  paused = false,
}: {
  species: PetSpecies
  coat: string
  /** Target width in points; snapped to whole device pixels. */
  size: number
  mood?: PetMood
  seed?: number
  /** Holds still, e.g. while scrolled out of view. */
  paused?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const active = useSceneActive(paused)
  const side = crispScale(size, SPRITE_SIZE, PixelRatio.get()) * SPRITE_SIZE
  const image = useSharedValue<SkImage | null>(
    spriteImage(species, coat, frameKey(mood, 0, seed))
  )

  useEffect(() => {
    image.set(spriteImage(species, coat, frameKey(mood, 0, seed)))
    if (reduceMotion || !active) return
    let last = ''
    return subscribe((tMs) => {
      const key = frameKey(mood, tMs, seed)
      const id = spriteKey(species, coat, key)
      if (id === last) return
      last = id
      image.set(spriteImage(species, coat, key))
    })
  }, [image, species, coat, mood, seed, reduceMotion, active])

  return (
    <Canvas style={{ width: side, height: side }} pointerEvents='none'>
      <Image
        image={image}
        x={0}
        y={0}
        width={side}
        height={side}
        sampling={SAMPLING}
      />
    </Canvas>
  )
}
