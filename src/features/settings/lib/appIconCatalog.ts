import type { TranslationKey } from '@/lib/locales'
import type { AlternateAppIconName, AppIconVariant } from '@/stores/preferences'

export type AppIconOption = { variant: AppIconVariant; label: TranslationKey }

export type AppIconGroup = {
  id: 'classic' | 'colors' | 'pets' | 'scenes' | 'seasons' | 'playful'
  title: TranslationKey
  options: AppIconOption[]
}

export const APP_ICON_GROUPS: AppIconGroup[] = [
  {
    id: 'classic',
    title: 'appIconGroupClassic',
    options: [
      { variant: 'Default', label: 'appIconDefault' },
      { variant: 'Dark', label: 'appIconDark' },
      { variant: 'Gold', label: 'appIconGold' },
      { variant: 'Mono', label: 'appIconMono' },
      { variant: 'Minimalist', label: 'appIconMinimalist' },
    ],
  },
  {
    id: 'colors',
    title: 'appIconGroupColors',
    options: [
      { variant: 'Cherry', label: 'appIconCherry' },
      { variant: 'Tangerine', label: 'appIconTangerine' },
      { variant: 'Lemon', label: 'appIconLemon' },
      { variant: 'Lagoon', label: 'appIconLagoon' },
      { variant: 'Sky', label: 'appIconSky' },
      { variant: 'Blueberry', label: 'appIconBlueberry' },
      { variant: 'Grape', label: 'appIconGrape' },
      { variant: 'Bubblegum', label: 'appIconBubblegum' },
    ],
  },
  {
    id: 'pets',
    title: 'appIconGroupPets',
    options: [
      { variant: 'PetLion', label: 'pet.species.lion' },
      { variant: 'PetDog', label: 'pet.species.dog' },
      { variant: 'PetCat', label: 'pet.species.cat' },
      { variant: 'PetDonkey', label: 'pet.species.donkey' },
      { variant: 'PetLamb', label: 'pet.species.lamb' },
      { variant: 'PetLionAndLamb', label: 'appIconLionAndLamb' },
    ],
  },
  {
    id: 'scenes',
    title: 'appIconGroupScenes',
    options: [
      { variant: 'Paradise', label: 'appIconParadise' },
      { variant: 'Sunrise', label: 'appIconSunrise' },
      { variant: 'Ocean', label: 'appIconOcean' },
      { variant: 'Mountains', label: 'appIconMountains' },
      { variant: 'NightSky', label: 'appIconNightSky' },
      { variant: 'Aurora', label: 'appIconAurora' },
    ],
  },
  {
    id: 'seasons',
    title: 'appIconGroupSeasons',
    options: [
      { variant: 'Seasonal', label: 'appIconSeasonal' },
      { variant: 'SeasonalSpring', label: 'appIconSpring' },
      { variant: 'SeasonalSummer', label: 'appIconSummer' },
      { variant: 'SeasonalFall', label: 'appIconFall' },
      { variant: 'SeasonalWinter', label: 'appIconWinter' },
    ],
  },
  {
    id: 'playful',
    title: 'appIconGroupPlayful',
    options: [
      { variant: 'Neon', label: 'appIconNeon' },
      { variant: 'Glass', label: 'appIconGlass' },
      { variant: 'Pixel', label: 'appIconPixel' },
      { variant: 'Blueprint', label: 'appIconBlueprint' },
      { variant: 'Retro', label: 'appIconRetro' },
      { variant: 'Sticker', label: 'appIconSticker' },
    ],
  },
]

const ALTERNATE_ICONS = new Set<string>(
  APP_ICON_GROUPS.flatMap((group) =>
    group.options
      .map((option) => option.variant)
      .filter((variant) => variant !== 'Default' && variant !== 'Seasonal')
  )
)

export const isAlternateAppIcon = (
  name: string
): name is AlternateAppIconName => ALTERNATE_ICONS.has(name)
