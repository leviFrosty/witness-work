import {
  faBell,
  faClockRotateLeft,
  faClone,
  faCloudArrowUp,
  faCrosshairs,
  faEye,
  faHouse,
  faLocationDot,
  faPalette,
  faPenToSquare,
  faSliders,
  faTextHeight,
  faTrash,
} from '@fortawesome/free-solid-svg-icons'

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
