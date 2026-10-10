import { Pencil as PencilIcon } from 'lucide-react-native'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import i18n from '@/lib/locales'

/** Edit and More (the record's other actions) for a details screen's header. */
export default function DetailsHeaderActions({
  onEdit,
  menu,
}: {
  onEdit: () => void
  menu: ContextMenuEntries
}) {
  return (
    <>
      <PointerTooltip label={i18n.t('edit')} effect='none'>
        <IconButton
          icon={PencilIcon}
          size={20}
          onPress={onEdit}
          accessibilityLabel={i18n.t('edit')}
        />
      </PointerTooltip>
      <PointerTooltip label={i18n.t('more')} effect='none'>
        <PullDownMenu
          actions={menu}
          accessibilityLabel={i18n.t('more')}
          triggerSize={20}
        />
      </PointerTooltip>
    </>
  )
}
