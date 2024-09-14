import { View } from 'react-native'
import i18n from '../lib/locales'
import { usePreferences } from '../stores/preferences'
import Select, { SelectData } from './Select'
import usePublisher, { hasAnnualGoal } from '../hooks/usePublisher'

const AnnualGoalSelector = () => {
  const { status } = usePublisher()
  const { set, userSpecifiedHasAnnualGoal } = usePreferences()
  const hasAnnualGoalByDefault = hasAnnualGoal(
    status,
    userSpecifiedHasAnnualGoal
  )

  const items: SelectData<boolean | 'default'> = [
    {
      label: `${i18n.t('default')} (${i18n.t(
        hasAnnualGoalByDefault ? 'yes' : 'no'
      )})`,
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
