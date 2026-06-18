import { useNavigation } from '@react-navigation/native'
import Wrapper from '@/components/ui/layout/Wrapper'
import type { RootStackNavigation } from '@/types/rootStack'
import NotesImportWizard from '@/features/notes-import/components/NotesImportWizard'

/**
 * Settings surface for Notes Import. Uses `'fillIfUnset'` so importing here
 * never clobbers a Publisher role / Tenure the user already set (decision 4) —
 * onboarding uses `'overwrite'`.
 */
const NotesImportScreen = () => {
  const navigation = useNavigation<RootStackNavigation>()
  return (
    <Wrapper insets='bottom' style={{ paddingHorizontal: 15, paddingTop: 30 }}>
      <NotesImportWizard
        publisherMode='fillIfUnset'
        onRequestUpgrade={() => navigation.navigate('Paywall')}
      />
    </Wrapper>
  )
}

export default NotesImportScreen
