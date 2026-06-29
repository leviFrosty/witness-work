import NotesImportSupporterCta from '@/app/components/NotesImportSupporterCta'
import NotesImportComposerScreen from '@/features/notes-import/screens/NotesImportComposerScreen'

/**
 * App-tier route composition: Notes Import owns the single chat flow; Supporter
 * owns its upgrade CTA (kept out of the feature via this render-prop).
 */
const NotesImportComposerRouteScreen = () => (
  <NotesImportComposerScreen
    renderSupporterCta={({ onPress }) => (
      <NotesImportSupporterCta onPress={onPress} />
    )}
  />
)

export default NotesImportComposerRouteScreen
