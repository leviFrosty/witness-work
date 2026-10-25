/**
 * Sample scenes (the design board's example rooms and hidden moments) for
 * snapshot tests, the PNG gallery and dev tools.
 */
import { DEMO_SIGN_DATA, type ResolvedRoom, type SceneInput } from '..'

const ROOM: ResolvedRoom = {
  time: 'night',
  season: 'summer',
  wallColor: 'sand',
  wallPattern: 'dots',
  floor: 'wood',
  bed: 'rug',
  shelf: 'scrolls',
  lamp: 'clay',
  sign: 'none',
}

const room = (patch: Partial<ResolvedRoom>): ResolvedRoom => ({
  ...ROOM,
  ...patch,
})

/** Named sample scenes with the time to render them at. */
export const SCENES: Readonly<Record<string, readonly [SceneInput, number]>> = {
  winterNight: [
    {
      room: room({
        time: 'night',
        season: 'winter',
        floor: 'stone',
        lamp: 'lantern',
        bed: 'cushion',
        wallColor: 'sky',
        wallPattern: 'trellis',
        sign: 'year',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 5,
      pet: { species: 'cat', coat: 'tuxedo', mood: 'happy', seed: 1000 },
    },
    0,
  ],
  springMorning: [
    {
      room: room({
        time: 'dawn',
        season: 'spring',
        lamp: 'candle',
        bed: 'basket',
        wallColor: 'sage',
        wallPattern: 'stripes',
        shelf: 'pottery',
        sign: 'month',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 3,
      pet: { species: 'lamb', coat: 'default', mood: 'content', seed: 1000 },
    },
    0,
  ],
  autumnEvening: [
    {
      room: room({
        time: 'dusk',
        season: 'autumn',
        floor: 'brick',
        lamp: 'stand',
        wallColor: 'rose',
        shelf: 'books',
        sign: 'shared',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: { species: 'dog', coat: 'liver', mood: 'ok', seed: 1000 },
    },
    0,
  ],
  summerAfternoon: [
    {
      room: room({
        time: 'day',
        season: 'summer',
        floor: 'tile',
        bed: 'hay',
        wallColor: 'cream',
        wallPattern: 'plain',
        shelf: 'fruit',
        sign: 'plan',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 2,
      pet: { species: 'donkey', coat: 'default', mood: 'happy', seed: 1000 },
    },
    0,
  ],
  died: [
    {
      room: room({
        time: 'day',
        season: 'autumn',
        lamp: 'candle',
        shelf: 'books',
        sign: 'month',
      }),
      sign: { ...DEMO_SIGN_DATA, monthMinutes: 0 },
      lampLevel: 0,
      pet: { species: 'cat', coat: 'calico', mood: 'dead', seed: 1000 },
    },
    0,
  ],
  rainbow: [
    {
      room: room({ time: 'day', season: 'spring' }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: { species: 'lion', coat: 'default', mood: 'happy', seed: 1000 },
      moments: { rainbow: true },
    },
    0,
  ],
  paradise: [
    {
      room: room({ time: 'day', season: 'summer', bed: 'cushion' }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 3,
      pet: { species: 'dog', coat: 'gold', mood: 'happy', seed: 1000 },
      moments: { paradise: true },
    },
    2600,
  ],
  shootingStar: [
    {
      room: room({
        time: 'night',
        season: 'winter',
        wallColor: 'sky',
        wallPattern: 'trellis',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: { species: 'cat', coat: 'black', mood: 'happy', seed: 1000 },
      moments: { star: true },
    },
    300,
  ],
  visitor: [
    {
      room: room({
        time: 'day',
        season: 'spring',
        floor: 'stone',
        wallColor: 'sage',
      }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: { species: 'lamb', coat: 'default', mood: 'happy', seed: 1000 },
      visitors: [{ species: 'dog', coat: 'white' }],
    },
    0,
  ],
  gifts: [
    {
      room: room({ time: 'dawn', season: 'summer', bed: 'hay' }),
      sign: DEMO_SIGN_DATA,
      lampLevel: 4,
      pet: { species: 'donkey', coat: 'default', mood: 'happy', seed: 1000 },
      moments: { sill: ['olive', 'fig', 'pebble', 'feather'], gift: 'lily' },
    },
    0,
  ],
  goldArabic: [
    {
      room: room({
        time: 'day',
        season: 'summer',
        bed: 'cushion',
        lamp: 'lantern',
        wallColor: 'sky',
        wallPattern: 'stripes',
        sign: 'month',
      }),
      sign: { ...DEMO_SIGN_DATA, digits: 'arab' },
      lampLevel: 5,
      pet: { species: 'dog', coat: 'gold', mood: 'happy', seed: 1000 },
      moments: { gold: true },
    },
    0,
  ],
}
