import { expectTypeOf, it } from 'vitest'
import type { TranslationKey } from '@/lib/locales'

it('accepts plural translations and nested leaves, but not containers or unknown keys', () => {
  expectTypeOf<
    Extract<TranslationKey, 'hoursShort'>
  >().toEqualTypeOf<'hoursShort'>()
  expectTypeOf<
    Extract<TranslationKey, 'hoursShort.one'>
  >().toEqualTypeOf<'hoursShort.one'>()
  expectTypeOf<
    Extract<TranslationKey, 'mileage.car'>
  >().toEqualTypeOf<'mileage.car'>()
  expectTypeOf<Extract<TranslationKey, 'mileage'>>().toEqualTypeOf<never>()
  expectTypeOf<
    Extract<TranslationKey, 'not-a-translation'>
  >().toEqualTypeOf<never>()
})
