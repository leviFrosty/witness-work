import { getLocales } from 'expo-localization'
import i18n from '@/lib/locales'
import useMileage from '@/stores/mileage'
import { ensurePremadeFuels } from '@/lib/mileage/premadeFuels'

export function addPremadeFuels(): void {
  const locale = getLocales()[0]
  useMileage.setState((state) => {
    const changes = ensurePremadeFuels(state, {
      region: locale?.regionCode,
      currency: locale?.currencyCode,
      names: {
        gasoline: i18n.t('mileage.premadeFuel_gasoline'),
        diesel: i18n.t('mileage.premadeFuel_diesel'),
        electric: i18n.t('mileage.premadeFuel_electric'),
      },
    })
    return changes ?? state
  })
}
