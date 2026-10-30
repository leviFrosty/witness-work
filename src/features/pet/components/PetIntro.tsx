import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useToday from '@/hooks/useToday'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import type { PetRecord, RoomWindow } from '@/types/pet'
import { resolveRoom, type PlayerInput } from '@/features/pet/art'
import { cssColor } from '@/features/pet/art/gameUi'
import { GameButton } from '@/features/pet/components/GameControls'
import { GameFrame, gamePixelScale } from '@/features/pet/components/GamePixels'
import PixelHearts from '@/features/pet/components/PixelHearts'
import useGamePalette from '@/features/pet/hooks/useGamePalette'
import usePetLife from '@/features/pet/hooks/usePetLife'
import usePetSignData from '@/features/pet/hooks/usePetSignData'
import usePetWindow from '@/features/pet/hooks/usePetWindow'
import {
  fullyUnlockedRoom,
  INTRO_HAT,
  INTRO_STEPS,
  type IntroStep,
} from '@/features/pet/lib/intro'
import { petDisplayName } from '@/features/pet/lib/names'
import PetSceneView from '@/features/pet/render/PetSceneView'

const LIVE: RoomWindow = { time: 'live', season: 'live' }
/** The intro's rooms don't need to be wider than this (iPad, landscape). */
const PREVIEW_MAX_WIDTH = 420
/** A new pet's hearts, until its life is worked out. */
const NEW_PET_HEARTS = 3

/**
 * The short intro right after adopting: how hearts fill, the coins that buy
 * items in the Shop (with a room that has them all), and tapping the card to
 * decorate. Each step shows the new pet in its room; tapping it pats it here
 * too.
 */
export default function PetIntro({
  pet,
  onDone,
}: {
  pet: PetRecord
  onDone: () => void
}) {
  const theme = useTheme()
  const palette = useGamePalette()
  const state = usePetLife()
  const sign = usePetSignData(useToday())
  const liveNow = usePetWindow(LIVE)
  const [index, setIndex] = useState(0)
  const step: IntroStep = INTRO_STEPS[index]
  const last = index === INTRO_STEPS.length - 1
  const name = petDisplayName(pet)

  // Swiping the sheet away counts as leaving the intro at this step.
  const reached = useRef({ step: 1, finished: false })
  useEffect(
    () => () =>
      analytics.capture('pet_intro_closed', {
        step: reached.current.step,
        finished: reached.current.finished,
      }),
    []
  )

  const scenePet = {
    species: pet.species,
    coat: pet.coat,
    mood: 'happy' as const,
    seed: 1000,
  }
  const input: PlayerInput =
    step === 'shop'
      ? {
          room: resolveRoom(fullyUnlockedRoom(state.room), {
            time: 'dusk',
            season: liveNow.season,
          }),
          sign,
          lampLevel: 5,
          pet: scenePet,
        }
      : {
          room: resolveRoom(
            step === 'decorate'
              ? { ...state.room, hat: INTRO_HAT }
              : state.room,
            liveNow
          ),
          sign,
          lampLevel: state.lampLevel,
          pet: scenePet,
        }

  const title = i18n.t(`pet.intro.${step}.title`)
  const body =
    step === 'shop'
      ? i18n.t('pet.intro.shop.body')
      : step === 'hearts'
        ? i18n.t(
            // Monthly reporters' hearts fill by the month (ADR 0031).
            state.monthlyHearts
              ? 'pet.intro.hearts.bodyMonths'
              : 'pet.intro.hearts.body'
          )
        : i18n.t('pet.intro.decorate.body')

  return (
    // Android shows it full screen: Next stays at the bottom.
    <View
      style={{
        gap: 16,
        flex: Platform.select({ android: 1, default: undefined }),
      }}
    >
      <GameFrame
        kind='preview'
        palette={palette}
        style={{
          width: '100%',
          maxWidth: PREVIEW_MAX_WIDTH,
          alignSelf: 'center',
          padding: 2 * gamePixelScale(),
        }}
      >
        <PetSceneView
          input={input}
          accessibilityLabel={
            step === 'shop'
              ? i18n.t('pet.intro.previewA11y', { name })
              : i18n.t('pet.a11y.scene', { name })
          }
          accessibilityHint={i18n.t('pet.a11y.patHint')}
        />
      </GameFrame>
      <View style={{ gap: 6 }}>
        <Text
          accessibilityRole='header'
          style={{
            fontSize: theme.fontSize('lg'),
            fontFamily: theme.fonts.bold,
            color: palette.ink,
          }}
        >
          {title}
        </Text>
        {step === 'hearts' && (
          <PixelHearts
            hearts={state.life?.hearts ?? NEW_PET_HEARTS}
            height={12}
          />
        )}
        <Text style={{ color: palette.inkAlt, lineHeight: 21 }}>{body}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
          marginTop: 'auto',
        }}
      >
        <View
          accessible
          accessibilityLabel={i18n.t('pet.intro.step', {
            step: index + 1,
            count: INTRO_STEPS.length,
          })}
          style={{ flexDirection: 'row', gap: 6 }}
        >
          {INTRO_STEPS.map((key, i) => (
            <View
              key={key}
              style={{
                width: i === index ? 18 : 7,
                height: 7,
                backgroundColor: cssColor(
                  i === index ? palette.accent : palette.cardEdge
                ),
              }}
            />
          ))}
        </View>
        <View style={{ flex: 1 }}>
          <GameButton
            label={i18n.t(last ? 'pet.intro.done' : 'pet.intro.next')}
            palette={palette}
            onPress={() => {
              if (!last) {
                setIndex(index + 1)
                reached.current.step = index + 2
                return
              }
              reached.current.finished = true
              onDone()
            }}
          />
        </View>
      </View>
    </View>
  )
}
