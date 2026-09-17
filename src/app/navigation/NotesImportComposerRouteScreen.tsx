import { useFeatureFlag } from '@/lib/featureFlags'
import Empty from '@/components/ui/Empty'
import Wrapper from '@/components/ui/layout/Wrapper'
import i18n from '@/lib/locales'
import NotesImportSupporterCta from '@/app/components/NotesImportSupporterCta'
import NotesImportComposerScreen from '@/features/notes-import/screens/NotesImportComposerScreen'

/**
 * App-tier route composition: Notes Import owns the single chat flow; Supporter
 * owns its upgrade CTA (kept out of the feature via this render-prop).
 */
const NotesImportComposerRouteScreen = () => {
  const enabled = useFeatureFlag('notes-import')
  if (!enabled) {
    return (
      <Wrapper insets='bottom'>
        <Empty title={i18n.t('notesImport_unavailable')} />
      </Wrapper>
    )
  }
  return (
    <NotesImportComposerScreen
      renderSupporterCta={({ onPress }) => (
        <NotesImportSupporterCta onPress={onPress} />
      )}
    />
  )
}

export default NotesImportComposerRouteScreen
