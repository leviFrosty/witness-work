import { View } from 'react-native'
import {
  useNavigation,
  useRoute,
  type RouteProp,
} from '@react-navigation/native'
import { faPlus } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome'
import Button from '@/components/ui/Button'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import type { RootStackNavigation, RootStackParamList } from '@/types/rootStack'

/**
 * Composer header action (ADR 0009): a New Import button. History is reached
 * from the in-composer "View imports" callout now, so the header no longer
 * carries a clock — this is just the "+".
 *
 * "New Import" only makes sense when an import is already on screen. On a blank
 * composer (no active hash) it's a no-op, so the button is hidden.
 */
const NotesImportHeaderActions = () => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const activeHash =
    useRoute<RouteProp<RootStackParamList, 'NotesImportComposer'>>().params
      ?.hash ?? null

  const startNew = () => navigation.setParams({ hash: undefined })

  return (
    <View
      style={{
        position: 'absolute',
        right: 0,
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {activeHash && (
        <Button
          accessibilityRole='button'
          accessibilityLabel={i18n.t('notesImport_newImport')}
          hitSlop={6}
          onPress={startNew}
          style={{
            width: 32,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={faPlus}
            size={15}
            color={theme.colors.accent}
          />
        </Button>
      )}
    </View>
  )
}

export default NotesImportHeaderActions
