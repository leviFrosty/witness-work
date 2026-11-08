import {
  BookOpen as BookOpenIcon,
  ClipboardList as ClipboardListIcon,
  Highlighter as HighlighterIcon,
  HouseHeart as HouseHeartIcon,
  NotebookPen as NotebookPenIcon,
} from 'lucide-react-native'
import type { AppIcon } from '@/components/ui/LucideIcon'
import type { RoutineHabit } from '@/types/routine'

export const HABIT_ICONS: Record<RoutineHabit, AppIcon> = {
  bibleReading: BookOpenIcon,
  personalStudy: NotebookPenIcon,
  midweekPrep: ClipboardListIcon,
  weekendPrep: HighlighterIcon,
  worship: HouseHeartIcon,
}
