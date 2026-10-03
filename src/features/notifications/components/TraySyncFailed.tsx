import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import XView from '@/components/ui/layout/XView'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

/** A slim notice that the tray couldn't check for new items, with a retry. */
export default function TraySyncFailed({ onRetry }: { onRetry: () => void }) {
  const theme = useTheme()

  return (
    <XView
      accessibilityRole='alert'
      style={{
        gap: 8,
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <Text
        style={{
          flex: 1,
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
        }}
      >
        {i18n.t('notifications_syncFailed')}
      </Text>
      <Button noTransform onPress={onRetry}>
        <Text
          style={{
            color: theme.colors.accent,
            fontFamily: theme.fonts.semiBold,
            fontSize: theme.fontSize('sm'),
          }}
        >
          {i18n.t('notifications_tryAgain')}
        </Text>
      </Button>
    </XView>
  )
}
