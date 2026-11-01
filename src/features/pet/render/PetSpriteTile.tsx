import { useEffect, useRef } from 'react'
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
  faceOf,
  idlePose,
  MOUTH_CLOSING_MS,
  mouthOpen,
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

  size: number
  mood?: PetMood
  seed?: number

  paused?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const active = useSceneActive(paused)
  const side = crispScale(size, SPRITE_SIZE, PixelRatio.get()) * SPRITE_SIZE
  const image = useSharedValue<SkImage | null>(
    spriteImage(species, coat, frameKey(mood, 0, seed))
  )
  const shownMood = useRef(mood)

  useEffect(() => {
    const closing =
      !reduceMotion &&
      active &&
      mouthOpen(faceOf(shownMood.current)) &&
      !mouthOpen(faceOf(mood))
    shownMood.current = mood
    const still = frameKey(mood, 0, seed)
    image.set(spriteImage(species, coat, { ...still, mouthClosing: closing }))
    if (reduceMotion || !active) return
    const closingUntil = closing ? performance.now() + MOUTH_CLOSING_MS : 0
    let last = ''
    return subscribe((tMs) => {
      if (tMs < closingUntil) return
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
