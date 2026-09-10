import { FileText } from 'lucide-react-native'
import LucideIcon from '@/components/ui/LucideIcon'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** Shared report affordance; the owning feature supplies navigation. */
export default function ViewReportButton({ onPress }: { onPress: () => void }) {
  const theme = useTheme()
  return (
    <Button
      accessibilityLabel={i18n.t('viewReport')}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderWidth: 1,
        borderColor: theme.colors.border,
        borderRadius: 999,
        borderCurve: 'continuous',
      }}
    >
      <LucideIcon
        icon={FileText}
        size={theme.fontSize('sm')}
        color={theme.colors.textAlt}
      />
      <Text
        style={{
          color: theme.colors.textAlt,
          fontFamily: theme.fonts.semiBold,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('viewReport')}
      </Text>
    </Button>
  )
}
