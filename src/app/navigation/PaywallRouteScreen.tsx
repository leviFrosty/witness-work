import PaywallScreen from '@/features/supporter/screens/PaywallScreen'
import { useNotesImportAvailability } from '@/features/notes-import/hooks/useNotesImportAvailability'
import { notesImportScheduleCopy } from '@/features/notes-import/lib/notesImportScheduleCopy'

/**
 * App-tier composition for Supporter UI that may show fresh Scribe schedule
 * data.
 */
const PaywallRouteScreen = () => {
  const { schedule } = useNotesImportAvailability()
  const scheduleCopy = schedule ? notesImportScheduleCopy(schedule) : null

  return (
    <PaywallScreen
      notesImportAllowance={
        scheduleCopy
          ? {
              free: scheduleCopy.freeImports,
              supporter: scheduleCopy.supporterImports,
            }
          : undefined
      }
    />
  )
}

export default PaywallRouteScreen
