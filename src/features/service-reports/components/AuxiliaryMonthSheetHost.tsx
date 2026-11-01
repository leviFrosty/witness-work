import AuxiliaryMonthSheet from '@/features/service-reports/components/AuxiliaryMonthSheet'
import { useAuxiliaryMonthSheet } from '@/features/service-reports/stores/auxiliaryMonthSheet'

export default function AuxiliaryMonthSheetHost() {
  const open = useAuxiliaryMonthSheet((state) => state.open)
  return (
    <AuxiliaryMonthSheet
      open={open}
      onOpenChange={(next) => useAuxiliaryMonthSheet.setState({ open: next })}
      source='notifications_tray'
    />
  )
}
