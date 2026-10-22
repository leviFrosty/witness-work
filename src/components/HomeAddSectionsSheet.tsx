import {
  CalendarDays as CalendarDaysIcon,
  Car as CarIcon,
  FileText as FileTextIcon,
  Flag as FlagIcon,
  LayoutGrid as LayoutGridIcon,
  Lightbulb as LightbulbIcon,
  MessagesSquare as MessagesSquareIcon,
  PawPrint as PawPrintIcon,
  Timer as TimerIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import AddItemsSheet from '@/components/ui/reorderable/AddItemsSheet'
import { useScribeEnabled } from '@/hooks/useScribeEnabled'
import i18n from '@/lib/locales'
import { homeSectionTitle } from '@/lib/homeSections'
import type { HomeScreenElementKey } from '@/stores/preferences'

const ICONS: Record<HomeScreenElementKey, AppIcon> = {
  approachingConversations: MessagesSquareIcon,
  tabletServiceYearSummary: FlagIcon,
  serviceReport: FileTextIcon,
  mileage: CarIcon,
  pet: PawPrintIcon,
  quickActions: LayoutGridIcon,
  thisWeek: CalendarDaysIcon,
  timer: TimerIcon,
  didYouKnow: LightbulbIcon,
}

/**
 * Home's sections to show again, like the Home Screen's widget gallery:
 * sections showing have a check, hidden ones come back with one tap, at the
 * top.
 */
export default function HomeAddSectionsSheet({
  open,
  onClose,
  sections,
  hidden,
  onAdd,
}: {
  open: boolean
  onClose: () => void
  /** The sections this User and device can show, in Home's order. */
  sections: HomeScreenElementKey[]
  hidden: HomeScreenElementKey[]
  onAdd: (key: HomeScreenElementKey) => void
}) {
  // Quick Actions holds the Scribe AI orb; say so, since hiding it hides that.
  const scribeEnabled = useScribeEnabled()
  const description = (key: HomeScreenElementKey) =>
    key === 'quickActions' && scribeEnabled
      ? i18n.t('homeEdit.description.quickActionsScribe')
      : i18n.t(`homeEdit.description.${key}`)
  return (
    <AddItemsSheet
      open={open}
      onClose={onClose}
      title={i18n.t('homeEdit.addSections')}
      addedHint={i18n.t('homeEdit.added')}
      testID='home-add-sections-sheet'
      onAdd={onAdd}
      groups={[
        {
          key: 'sections',
          items: sections.map((key) => ({
            id: key,
            icon: ICONS[key],
            title: homeSectionTitle(key),
            description: description(key),
            added: !hidden.includes(key),
          })),
        },
      ]}
    />
  )
}
