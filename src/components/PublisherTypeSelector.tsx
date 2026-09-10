import { Alert, TextInput as RNTextInput, View } from 'react-native'
import moment from 'moment'
import i18n from '@/lib/locales'
import { usePreferences } from '@/stores/preferences'
import { publishers } from '@/constants/publisher'
import Select, { SelectData } from '@/components/ui/Select'
import { Publisher } from '@/types/publisher'
import { useRef, useState } from 'react'
import { monthlyGoalKey } from '@/lib/monthlyGoals'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import TextInputRow from '@/components/ui/inputs/TextInputRow'

const PublisherTypeSelector = ({
  showGoalDescription = true,
}: {
  showGoalDescription?: boolean
}) => {
  const items: SelectData<Publisher> = [
    {
      label: i18n.t('publisher'),
      value: publishers[0],
    },
    {
      label: i18n.t('regularAuxiliary'),
      value: publishers[1],
    },
    {
      label: i18n.t('regularPioneer'),
      value: publishers[2],
    },
    {
      label: i18n.t('circuitOverseer'),
      value: publishers[3],
    },
    {
      label: i18n.t('specialPioneer'),
      value: publishers[4],
    },
    {
      label: i18n.t('custom'),
      value: publishers[5],
    },
  ]

  const { publisherHours, role, monthlyGoalOverrides, setRole, set } =
    usePreferences()
  const [goalHours, setGoalHours] = useState(publisherHours.custom.toString())
  const customHoursInput = useRef<RNTextInput>(null)

  const handleRoleChange = (nextRole: Publisher) => {
    if (nextRole === role) return

    const now = moment()
    const currentMonthKey = monthlyGoalKey({
      year: now.year(),
      month: now.month(),
    })
    const futureOverrideKeys = Object.keys(monthlyGoalOverrides).filter(
      (key) => key >= currentMonthKey
    )

    if (futureOverrideKeys.length === 0) {
      setRole(nextRole)
      return
    }

    Alert.alert(
      i18n.t('monthGoalEditor.roleChangeTitle'),
      i18n.t('monthGoalEditor.roleChangeDescription'),
      [
        { text: i18n.t('cancel'), style: 'cancel' },
        {
          text: i18n.t('monthGoalEditor.keepGoals'),
          onPress: () => setRole(nextRole),
        },
        {
          text: i18n.t('monthGoalEditor.resetFutureGoals'),
          style: 'destructive',
          onPress: () => {
            const pastOverrides = Object.fromEntries(
              Object.entries(monthlyGoalOverrides).filter(
                ([key]) => key < currentMonthKey
              )
            )
            set({ monthlyGoalOverrides: pastOverrides })
            setRole(nextRole)
          },
        },
      ]
    )
  }

  const saveCustomHours = () => {
    if (goalHours) {
      set({
        publisherHours: {
          ...publisherHours,
          custom: parseFloat(goalHours) ?? 0,
        },
      })
    }
  }

  const requirement =
    role === publishers[0]
      ? i18n.t('noHourRequirement')
      : i18n.t('hourMonthlyRequirement', {
          count: publisherHours[role],
        })
  const select = (
    <Select
      accessibilityLabel={i18n.t('status')}
      data={items}
      onChange={({ value }) => handleRoleChange(value)}
      value={role}
    />
  )

  return (
    <View>
      <InputRowContainer
        label={i18n.t('status')}
        info={
          showGoalDescription && role !== publishers[0]
            ? i18n.t('defaultMonthlyGoal_description')
            : undefined
        }
        description={requirement}
      >
        {select}
      </InputRowContainer>

      {role === 'custom' && (
        <TextInputRow
          ref={customHoursInput}
          label={i18n.t('customHourRequirement')}
          info={i18n.t('defaultMonthlyGoal_description')}
          controlStyle={{ width: 96 }}
          textInputProps={{
            accessibilityLabel: i18n.t('customHourRequirement'),
            maxLength: 5,
            value: goalHours,
            onChangeText: setGoalHours,
            onBlur: saveCustomHours,
            inputMode: 'decimal',
            textAlign: 'left',
          }}
        />
      )}
    </View>
  )
}
export default PublisherTypeSelector
