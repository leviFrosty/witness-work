import {
  CircleQuestionMark as CircleQuestionMarkIcon,
  Mars as MarsIcon,
  Venus as VenusIcon,
} from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import { Contact } from '@/types/contact'
import useTheme from '@/contexts/theme'

export const GENDER_COLORS = {
  male: '#5B9BD5',
  female: '#E58FB8',
} as const

type Props = {
  gender: NonNullable<Contact['gender']>
  size?: number
  /**
   * 0..1 — applied on top of the gender color. Lower values produce a more
   * subtle hint; full-strength reads as a label.
   */
  opacity?: number
  /** Override color (e.g. on top of an accent-tinted hero). */
  color?: string
}

const GenderIcon = ({ gender, size = 12, opacity = 1, color }: Props) => {
  const theme = useTheme()
  const icon =
    gender === 'male'
      ? MarsIcon
      : gender === 'female'
        ? VenusIcon
        : CircleQuestionMarkIcon
  const resolved =
    color ??
    (gender === 'male'
      ? GENDER_COLORS.male
      : gender === 'female'
        ? GENDER_COLORS.female
        : theme.colors.textAlt)
  return (
    <LucideIcon icon={icon} size={size} style={{ color: resolved, opacity }} />
  )
}

export default GenderIcon
