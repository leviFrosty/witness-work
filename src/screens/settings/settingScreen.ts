import { RootStackParamList } from '../../types/rootStack'

export type SettingsSectionProps = {
  handleNavigate: (destination: keyof RootStackParamList) => void
}
