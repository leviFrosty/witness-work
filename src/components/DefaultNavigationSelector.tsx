import { Platform } from 'react-native'
import i18n from '../lib/locales'
import InputRowSelect from './inputs/InputRowSelect'
import { SelectData } from './Select'
import {
  DefaultNavigationMapProvider,
  usePreferences,
} from '../stores/preferences'

export const navigationSelectionOptions: SelectData<DefaultNavigationMapProvider> =
  [
    {
      label: i18n.t('appleMaps'),
      value: 'apple',
    },
    {
      label: i18n.t('googleMaps'),
      value: 'google',
    },
    {
      label: i18n.t('waze'),
      value: 'waze',
    },
  ]

const DefaultNavigationSelector = () => {
  const { defaultNavigationMapProvider, set } = usePreferences()

  if (Platform.OS === 'android') {
    return null
  }

  return (
    <InputRowSelect
      selectProps={{
        data: navigationSelectionOptions,
        onChange: ({ value }) => set({ defaultNavigationMapProvider: value }),
        value: defaultNavigationMapProvider,
      }}
      label={i18n.t('defaultNavigationApp')}
      lastInSection
    />
  )
}
export default DefaultNavigationSelector
