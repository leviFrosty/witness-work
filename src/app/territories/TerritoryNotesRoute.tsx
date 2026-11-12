import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import type { RootStackParamList } from '@/types/rootStack'
import ScribeUsageMeter from '@/features/scribe/components/ScribeUsageMeter'
import TerritoryNotesScreen from '@/features/territories/screens/TerritoryNotesScreen'
import useTerritoryNotesScribe from '@/app/territories/useTerritoryNotesScribe'

type Props = NativeStackScreenProps<RootStackParamList, 'TerritoryNotes'>

export default function TerritoryNotesRoute(props: Props) {
  const ai = useTerritoryNotesScribe()
  const metered = ai.mode === 'available' || ai.mode === 'limited'
  return (
    <TerritoryNotesScreen
      {...props}
      ai={ai}
      meter={
        metered ? <ScribeUsageMeter surface='territory_notes' /> : undefined
      }
    />
  )
}
