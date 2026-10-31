import type { ImageSourcePropType } from 'react-native'
import profileIcon from '@/assets/android-menu-icons/ww_menu_profile.xml'
import settingsIcon from '@/assets/android-menu-icons/ww_menu_settings.xml'
import heartIcon from '@/assets/android-menu-icons/ww_menu_heart.xml'
import helpIcon from '@/assets/android-menu-icons/ww_menu_help.xml'
import shareIcon from '@/assets/android-menu-icons/ww_menu_share.xml'
import editIcon from '@/assets/android-menu-icons/ww_menu_edit.xml'
import clockIcon from '@/assets/android-menu-icons/ww_menu_clock.xml'
import archiveIcon from '@/assets/android-menu-icons/ww_menu_archive.xml'
import deleteIcon from '@/assets/android-menu-icons/ww_menu_delete.xml'
import conversationIcon from '@/assets/android-menu-icons/ww_menu_conversation.xml'
import doorIcon from '@/assets/android-menu-icons/ww_menu_door.xml'
import checkCircleIcon from '@/assets/android-menu-icons/ww_menu_check.xml'
import filterIcon from '@/assets/android-menu-icons/ww_menu_filter.xml'
import qrCodeIcon from '@/assets/android-menu-icons/ww_menu_qr_code.xml'
import qrScanIcon from '@/assets/android-menu-icons/ww_menu_qr_scan.xml'
import undoIcon from '@/assets/android-menu-icons/ww_menu_undo.xml'
import targetIcon from '@/assets/android-menu-icons/ww_menu_target.xml'
import cameraIcon from '@/assets/android-menu-icons/ww_menu_camera.xml'
import photoLibraryIcon from '@/assets/android-menu-icons/ww_menu_photo_library.xml'
import petsIcon from '@/assets/android-menu-icons/ww_menu_pets.xml'
import brushIcon from '@/assets/android-menu-icons/ww_menu_brush.xml'
import customizeIcon from '@/assets/android-menu-icons/ww_menu_customize.xml'
import hideIcon from '@/assets/android-menu-icons/ww_menu_hide.xml'
import storeIcon from '@/assets/android-menu-icons/ww_menu_store.xml'
import lockOpenIcon from '@/assets/android-menu-icons/ww_menu_lock_open.xml'

/**
 * Material icons for the SF Symbols menus use, so Android menus show the same
 * icons. Unmapped symbols show no icon there. To support another symbol, add a
 * `ww_menu_*.xml` drawable to `src/assets/android-menu-icons/` and map it
 * here.
 */
const androidMenuIcons: Partial<Record<string, ImageSourcePropType>> = {
  'person.crop.circle': profileIcon,
  gearshape: settingsIcon,
  heart: heartIcon,
  'questionmark.circle': helpIcon,
  'square.and.arrow.up': shareIcon,
  pencil: editIcon,
  clock: clockIcon,
  archivebox: archiveIcon,
  trash: deleteIcon,
  'bubble.left.and.bubble.right': conversationIcon,
  'door.left.hand.closed': doorIcon,
  'checkmark.circle': checkCircleIcon,
  'line.3.horizontal.decrease.circle': filterIcon,
  qrcode: qrCodeIcon,
  'qrcode.viewfinder': qrScanIcon,
  'arrow.uturn.backward': undoIcon,
  target: targetIcon,
  camera: cameraIcon,
  'photo.on.rectangle': photoLibraryIcon,
  pawprint: petsIcon,
  paintbrush: brushIcon,
  'square.grid.2x2': customizeIcon,
  'eye.slash': hideIcon,
  storefront: storeIcon,
  'lock.open': lockOpenIcon,
}

export default androidMenuIcons
