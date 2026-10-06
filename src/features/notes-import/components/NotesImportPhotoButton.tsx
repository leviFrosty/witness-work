import { Camera as CameraIcon } from 'lucide-react-native'
import { View } from 'react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import PullDownMenu from '@/components/ui/PullDownMenu'
import PointerTooltip from '@/components/ui/PointerTooltip'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

interface Props {
  /** The document camera needs a real camera; otherwise this picks photos. */
  scanSupported: boolean
  onScan: () => void
  onChoose: () => void
}

const SIZE = 32

/**
 * Photo import entry in the composer's control row: a menu to scan notes with
 * the document camera or choose photos, or straight to the photo picker where
 * there is no camera.
 */
const NotesImportPhotoButton = ({ scanSupported, onScan, onChoose }: Props) => {
  const theme = useTheme()
  const label = i18n.t('notesImport_photoImport')

  const face = (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.card,
      }}
    >
      <LucideIcon icon={CameraIcon} size={15} color={theme.colors.textAlt} />
    </View>
  )

  if (!scanSupported) {
    return (
      <PointerTooltip label={label} effect='none' placement='top'>
        <Button
          onPress={onChoose}
          accessibilityRole='button'
          accessibilityLabel={label}
        >
          {face}
        </Button>
      </PointerTooltip>
    )
  }

  return (
    <PointerTooltip label={label} effect='none' placement='top'>
      <PullDownMenu
        accessibilityLabel={label}
        pointerEffect='highlight'
        actions={[
          {
            id: 'scan',
            title: i18n.t('notesImport_photoScan'),
            systemImage: 'doc.viewfinder',
            onPress: onScan,
          },
          {
            id: 'choose',
            title: i18n.t('notesImport_photoChoose'),
            systemImage: 'photo.on.rectangle',
            onPress: onChoose,
          },
        ]}
      >
        {face}
      </PullDownMenu>
    </PointerTooltip>
  )
}

export default NotesImportPhotoButton
