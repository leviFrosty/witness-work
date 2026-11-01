import { UndoIcon } from '@/components/ui/DirectionalIcon'
import Button from '@/components/ui/Button'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import {
  undoBuddySettings,
  useBuddySettingsUndos,
} from '@/features/buddies/hooks/useBuddySettingsScope'

export default function BuddySettingsUndoButton({
  onUndone,
}: {
  onUndone: (inboxId: string | null) => void
}) {
  const theme = useTheme()
  const canUndo = useBuddySettingsUndos((state) => state.undos.length > 0)
  if (!canUndo) return null

  return (
    <Button
      noTransform
      hitSlop={12}
      onPress={() => {
        const undone = undoBuddySettings()
        if (undone) onUndone(undone.inboxId)
      }}
      accessibilityLabel={i18n.t('buddies_settingsUndo')}
    >
      <XView style={{ gap: 4 }}>
        <LucideIcon
          icon={UndoIcon}
          size={theme.fontSize('md')}
          color={theme.colors.accent}
        />
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t('buddies_settingsUndo')}
        </Text>
      </XView>
    </Button>
  )
}
