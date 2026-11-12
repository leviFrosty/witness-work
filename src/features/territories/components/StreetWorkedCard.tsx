import { CircleCheck as CircleCheckIcon } from 'lucide-react-native'
import { View } from 'react-native'
import ActionButton from '@/components/ui/ActionButton'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import { formatDate } from '@/lib/dates'
import i18n from '@/lib/locales'

export default function StreetWorkedCard({
  workedAt,
  onToggle,
  onOpenSettings,
}: {
  workedAt: number | undefined
  onToggle: () => void
  onOpenSettings: () => void
}) {
  const theme = useTheme()
  const worked = workedAt !== undefined
  return (
    <Card style={{ gap: 16 }} testID='street-worked-card'>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {worked && (
          <LucideIcon
            icon={CircleCheckIcon}
            size={24}
            color={theme.colors.accent}
          />
        )}
        <View style={{ flex: 1, gap: 4 }}>
          <Text
            testID='street-worked-status'
            style={{
              fontFamily: theme.fonts.semiBold,
              fontSize: theme.fontSize('lg'),
            }}
          >
            {worked
              ? i18n.t('territories.streetWorkedOn', {
                  date: formatDate(workedAt, { style: 'medium' }),
                })
              : i18n.t('territories.streetNotWorked')}
          </Text>
          <Text style={{ color: theme.colors.textAlt }}>
            {i18n.t('territories.privacyOn_description')}
          </Text>
        </View>
      </View>
      {worked ? (
        <Button
          variant='outline'
          onPress={onToggle}
          testID='street-worked-undo'
          style={{
            minHeight: 48,
            paddingVertical: 12,
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontFamily: theme.fonts.semiBold }}>
            {i18n.t('territories.markNotWorked')}
          </Text>
        </Button>
      ) : (
        <ActionButton
          onPress={onToggle}
          submitShortcut={false}
          testID='street-worked-mark'
        >
          {i18n.t('territories.markWorked')}
        </ActionButton>
      )}
      <Button
        onPress={onOpenSettings}
        testID='street-privacy-settings'
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text
          style={{
            textAlign: 'center',
            fontFamily: theme.fonts.semiBold,
            color: theme.colors.accent,
          }}
        >
          {i18n.t('territories.privacySettings')}
        </Text>
      </Button>
    </Card>
  )
}
