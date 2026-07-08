import {
  Bell as BellIcon,
  CloudUpload as CloudUploadIcon,
  Copy as CopyIcon,
  Crosshair as CrosshairIcon,
  Eye as EyeIcon,
  History as HistoryIcon,
  House as HouseIcon,
  MapPin as MapPinIcon,
  Palette as PaletteIcon,
  SlidersHorizontal as SlidersHorizontalIcon,
  SquarePen as SquarePenIcon,
  Trash2 as Trash2Icon,
  Type as TypeIcon,
} from 'lucide-react-native'
export type DidYouKnowTip = {
  /**
   * Stable identifier — never rename or reorder existing entries, since
   * dismissals are persisted by id. New tips can be appended freely.
   */
  id: string
  icon: typeof CopyIcon
}

/**
 * Ordered "Did you know?" tip list surfaced on the home screen. The card picks
 * the first entry whose id isn't in `preferences.seenTipIds` and rotates as the
 * user dismisses each one. Tips are deliberately small/lesser-known features —
 * the marquee items already live in MilestoneShowcaseScreen.
 */
export const DID_YOU_KNOW_TIPS: DidYouKnowTip[] = [
  { id: 'longPressCopy', icon: CopyIcon },
  { id: 'swipeEditConvo', icon: SquarePenIcon },
  { id: 'dragMapPin', icon: MapPinIcon },
  { id: 'longPressMap', icon: CrosshairIcon },
  { id: 'notAtHome', icon: HouseIcon },
  { id: 'accentColor', icon: PaletteIcon },
  { id: 'fontSizeOffset', icon: TypeIcon },
  { id: 'hideHomeSections', icon: EyeIcon },
  { id: 'followUpOffset', icon: HistoryIcon },
  { id: 'planNotifications', icon: BellIcon },
  { id: 'backupCadence', icon: CloudUploadIcon },
  { id: 'widgetSort', icon: SlidersHorizontalIcon },
  { id: 'swipeDeleteTime', icon: Trash2Icon },
]
