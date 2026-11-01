import { useEffect } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import Header from '@/components/ui/layout/Header'
import { RootStackParamList } from '@/types/rootStack'
import PlanDayForm from '@/features/plans/components/PlanDayForm'

type PlanDayScreenProps = NativeStackScreenProps<RootStackParamList, 'PlanDay'>

const PlanDayScreen = ({ route, navigation }: PlanDayScreenProps) => {
  const params = route.params ?? {}
  const isEditMode = !!(
    params.existingDayPlanId || params.existingRecurringPlanId
  )

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          noInsets
          title={i18n.t(isEditMode ? 'editPlan' : 'createPlan')}
        />
      ),
    })
  }, [isEditMode, navigation])

  return (
    <Wrapper insets='none' style={{ flex: 1 }}>
      <PlanDayForm
        params={params}
        source='plan_form'
        onSaved={(detailsTarget) => {
          const { routes } = navigation.getState()
          const opener = routes[routes.length - 2]
          if (detailsTarget && opener?.name === 'Plan Details') {
            navigation.popTo('Plan Details', detailsTarget)
          } else if (
            !isEditMode &&
            detailsTarget?.dayPlanId &&
            opener?.name === 'TodayRoute'
          ) {
            navigation.popTo('TodayRoute', {
              ...(opener.params as RootStackParamList['TodayRoute']),
              planId: detailsTarget.dayPlanId,
              newPlan: true,
            })
          } else {
            navigation.goBack()
          }
        }}
        onDeleted={() => navigation.goBack()}
      />
    </Wrapper>
  )
}

export default PlanDayScreen
