import { useEffect } from 'react'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import Header from '@/components/ui/layout/Header'
import { RootStackParamList } from '@/types/rootStack'
import PlanDayForm from '@/features/plans/components/PlanDayForm'

type PlanDayScreenProps = NativeStackScreenProps<RootStackParamList, 'PlanDay'>

const PlanDayScreen = ({ route, navigation }: PlanDayScreenProps) => {
  // A cold launch from the Calendar widget's "+" (`witnesswork://day`) opens
  // this screen with no params at all.
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
    // The dock applies the bottom safe area itself.
    <Wrapper insets='none' style={{ flex: 1 }}>
      <PlanDayForm
        params={params}
        source='plan_form'
        onSaved={(detailsTarget) => {
          // An edit can move the Plan, and one created from Plan Details
          // (Duplicate, Invite) opens there next.
          const { routes } = navigation.getState()
          const opener = routes[routes.length - 2]?.name
          if (detailsTarget && opener === 'Plan Details') {
            navigation.popTo('Plan Details', detailsTarget)
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
