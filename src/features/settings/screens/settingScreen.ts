import { RootStackParamList } from '@/types/rootStack'

export type SettingsSectionProps = {
  handleNavigate: (destination: keyof RootStackParamList) => void
  /** Destination showing beside the list in the wide split layout. */
  selectedDestination?: keyof RootStackParamList
}
