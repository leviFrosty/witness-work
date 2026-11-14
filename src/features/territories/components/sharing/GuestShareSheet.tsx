import { View } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import QRCode from 'react-native-qrcode-svg'
import { Copy as CopyIcon, Share as ShareIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import Sheet from '@/components/ui/Sheet'
import useTheme from '@/contexts/theme'
import { analytics } from '@/lib/analytics'
import i18n from '@/lib/locales'
import { shareUrl } from '@/lib/share'
import { toast } from '@/stores/toasts'

const canShare = () =>
  typeof navigator !== 'undefined' && typeof navigator.share === 'function'

export default function GuestShareSheet({
  open,
  url,
  title,
  territory,
  context,
  onClose,
  onForget,
}: {
  open: boolean
  url: string
  title: string
  territory: string
  context?: string
  onClose: () => void
  onForget?: () => void
}) {
  const theme = useTheme()

  const action = (
    icon: AppIcon,
    label: string,
    onPress: () => void,
    testID: string
  ) => (
    <Button
      onPress={onPress}
      testID={testID}
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        minHeight: 52,
        paddingHorizontal: 16,
        borderRadius: 26,
        backgroundColor: theme.colors.backgroundLighter,
      }}
    >
      <LucideIcon icon={icon} size={20} color={theme.colors.accent} />
      <Text style={{ fontFamily: theme.fonts.semiBold }}>{label}</Text>
    </Button>
  )

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      accessibilityLabel={i18n.t('territories.guest.shareTitle')}
      testID='guest-share-sheet'
    >
      <Sheet.ScrollView>
        <View
          style={{
            alignItems: 'center',
            gap: 18,
            paddingHorizontal: 20,
            paddingTop: 28,
            paddingBottom: 24,
          }}
        >
          <Text
            accessibilityRole='header'
            style={{
              fontFamily: theme.fonts.bold,
              fontSize: theme.fontSize('xl'),
              textAlign: 'center',
            }}
          >
            {i18n.t('territories.guest.shareTitle')}
          </Text>
          <Text
            style={{
              marginTop: -12,
              color: theme.colors.textAlt,
              textAlign: 'center',
            }}
          >
            {territory}
            {context ? `\n${context}` : ''}
          </Text>
          <View
            accessible
            accessibilityRole='image'
            accessibilityLabel={i18n.t('territories.share.guestQr_a11y')}
            testID='guest-share-qr'
            style={{
              padding: 14,
              borderRadius: 14,
              backgroundColor: '#FFFFFF',
            }}
          >
            <QRCode
              value={url}
              size={240}
              color='#000000'
              backgroundColor='#FFFFFF'
              ecl='M'
            />
          </View>
          <Text style={{ textAlign: 'center', fontSize: theme.fontSize('md') }}>
            {i18n.t('territories.guest.shareLine')}
          </Text>
          <View style={{ flexDirection: 'row', gap: 12, alignSelf: 'stretch' }}>
            {canShare() &&
              action(
                ShareIcon,
                i18n.t('territories.guest.shareLink'),
                () => {
                  analytics.capture('territory_guest_link_shared', {
                    method: 'share',
                  })
                  void shareUrl(url, title)
                },
                'guest-share-link'
              )}
            {action(
              CopyIcon,
              i18n.t('territories.guest.copyLink'),
              () => {
                analytics.capture('territory_guest_link_shared', {
                  method: 'copy',
                })
                void Clipboard.setStringAsync(url)
                toast.success(i18n.t('linkCopied'))
              },
              'guest-copy-link'
            )}
          </View>
          <Button
            testID='guest-share-done'
            onPress={onClose}
            style={{
              alignSelf: 'stretch',
              minHeight: 52,
              borderRadius: 26,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.backgroundLighter,
            }}
          >
            <Text
              style={{
                fontFamily: theme.fonts.bold,
                fontSize: theme.fontSize('lg'),
              }}
            >
              {i18n.t('done')}
            </Text>
          </Button>
          {onForget && (
            <Button
              testID='guest-forget'
              onPress={onForget}
              style={{
                minHeight: 44,
                paddingHorizontal: 16,
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  color: theme.colors.error,
                  fontFamily: theme.fonts.medium,
                }}
              >
                {i18n.t('territories.guest.forget')}
              </Text>
            </Button>
          )}
        </View>
      </Sheet.ScrollView>
    </Sheet>
  )
}
