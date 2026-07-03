import { faBell } from '@fortawesome/free-solid-svg-icons/faBell'
import { faClockRotateLeft } from '@fortawesome/free-solid-svg-icons/faClockRotateLeft'
import { faClone } from '@fortawesome/free-solid-svg-icons/faClone'
import { faCloudArrowUp } from '@fortawesome/free-solid-svg-icons/faCloudArrowUp'
import { faCrosshairs } from '@fortawesome/free-solid-svg-icons/faCrosshairs'
import { faEye } from '@fortawesome/free-solid-svg-icons/faEye'
import { faHouse } from '@fortawesome/free-solid-svg-icons/faHouse'
import { faLocationDot } from '@fortawesome/free-solid-svg-icons/faLocationDot'
import { faPalette } from '@fortawesome/free-solid-svg-icons/faPalette'
import { faPenToSquare } from '@fortawesome/free-solid-svg-icons/faPenToSquare'
import { faSliders } from '@fortawesome/free-solid-svg-icons/faSliders'
import { faTextHeight } from '@fortawesome/free-solid-svg-icons/faTextHeight'
import { faTrash } from '@fortawesome/free-solid-svg-icons/faTrash'

export type DidYouKnowTip = {
  /**
   * Stable identifier — never rename or reorder existing entries, since
   * dismissals are persisted by id. New tips can be appended freely.
   */
  id: string
  icon: typeof faClone
}

/**
 * Ordered "Did you know?" tip list surfaced on the home screen. The card picks
 * the first entry whose id isn't in `preferences.seenTipIds` and rotates as the
 * user dismisses each one. Tips are deliberately small/lesser-known features —
 * the marquee items already live in MilestoneShowcaseScreen.
 */
export const DID_YOU_KNOW_TIPS: DidYouKnowTip[] = [
  { id: 'longPressCopy', icon: faClone },
  { id: 'swipeEditConvo', icon: faPenToSquare },
  { id: 'dragMapPin', icon: faLocationDot },
  { id: 'longPressMap', icon: faCrosshairs },
  { id: 'notAtHome', icon: faHouse },
  { id: 'accentColor', icon: faPalette },
  { id: 'fontSizeOffset', icon: faTextHeight },
  { id: 'hideHomeSections', icon: faEye },
  { id: 'followUpOffset', icon: faClockRotateLeft },
  { id: 'planNotifications', icon: faBell },
  { id: 'backupCadence', icon: faCloudArrowUp },
  { id: 'widgetSort', icon: faSliders },
  { id: 'swipeDeleteTime', icon: faTrash },
]
