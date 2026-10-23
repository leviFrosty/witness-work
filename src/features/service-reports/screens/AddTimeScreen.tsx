import { useEffect, useState } from 'react'
import moment from 'moment'
import useServiceReport from '@/stores/serviceReport'
import { TimeEntry } from '@/types/timeEntry'
import { useNavigation } from '@react-navigation/native'
import i18n from '@/lib/locales'
import Wrapper from '@/components/ui/layout/Wrapper'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import Header from '@/components/ui/layout/Header'
import { getReport } from '@/lib/serviceReport'
import { RootStackNavigation, RootStackParamList } from '@/types/rootStack'
import TimeEntryForm from '@/features/service-reports/components/TimeEntryForm'
import { resetStopwatchSession } from '@/features/service-reports/hooks/useStopWatch'
import useDiscardChangesGuard from '@/hooks/useDiscardChangesGuard'

type AddTimeScreenProps = NativeStackScreenProps<RootStackParamList, 'Add Time'>

const AddTimeScreen = ({ route }: AddTimeScreenProps) => {
  const navigation = useNavigation<RootStackNavigation>()
  const serviceReports = useServiceReport((s) => s.serviceReports)
  const existingReport: TimeEntry | undefined = route.params?.existingReport
    ? JSON.parse(route.params.existingReport)
    : undefined
  const editing = !!getReport(serviceReports, existingReport)
  const [changed, setChanged] = useState(false)
  const allowLeave = useDiscardChangesGuard(changed)

  useEffect(() => {
    navigation.setOptions({
      header: () => (
        <Header
          buttonType='back'
          title={i18n.t(editing ? 'updateTime' : 'addTime')}
        />
      ),
    })
  }, [editing, navigation])

  return (
    // The dock applies the bottom safe area itself.
    <Wrapper insets='none' style={{ flex: 1 }}>
      <TimeEntryForm
        existingReport={existingReport}
        // Moment reads a bare deep-link day (`2026-10-01`) as local, not UTC.
        date={
          route.params?.date ? moment(route.params.date).toDate() : undefined
        }
        hours={route.params?.hours}
        minutes={route.params?.minutes}
        categoryId={route.params?.categoryId}
        note={route.params?.note}
        noteDoc={route.params?.noteDoc}
        source='time_entry_form'
        onChangedChange={setChanged}
        onDone={() => {
          // A timer session has no existing entry, so done means submitted.
          // Deep links pass params as strings, so only the timer's own values
          // clear it.
          const sessionStart = route.params?.timerSessionStart
          if (
            route.params?.fromTimer === true &&
            typeof sessionStart === 'number' &&
            !existingReport
          ) {
            void resetStopwatchSession(sessionStart)
          }
          allowLeave()
          navigation.goBack()
        }}
      />
    </Wrapper>
  )
}

export default AddTimeScreen
