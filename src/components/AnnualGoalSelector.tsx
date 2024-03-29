import { View } from 'react-native'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import Select, { SelectData } from './Select'

const AnnualGoalSelector = () => {
  const items: SelectData<boolean | 'default'> = [
    {
      label: i18n.t('default'),
      value: 'default',
    },
    {
      label: i18n.t('yes'),
      value: true,
    },
    {
      label: i18n.t('no'),
      value: false,
    },
  ]

  const { set, userSpecifiedHasAnnualGoal } = usePreferences()

  return (
    <View>
      <Select
        data={items}
        onChange={({ value }) => set({ userSpecifiedHasAnnualGoal: value })}
        value={userSpecifiedHasAnnualGoal}
        style={{ marginBottom: 10 }}
      />
    </View>
  )
}
export default AnnualGoalSelector
