import { Sheet } from 'tamagui'
import { Modal, ScrollView, View } from 'react-native'
import { useEffect, useState } from 'react'
import { faTimes } from '@fortawesome/free-solid-svg-icons'
import { useNavigation } from '@react-navigation/native'
import useTheme from '../contexts/theme'
import Text from './MyText'
import IconButton from './IconButton'
import Button from './Button'
import SupporterBadge from './SupporterBadge'
import SupporterBenefits from './SupporterBenefits'
import i18n from '../lib/locales'
import { RootStackNavigation } from '../types/rootStack'

interface Props {
  open: boolean
  setOpen: (open: boolean) => void
  /**
   * Optional key of the specific feature the user tapped. Surfaces slightly
   * different copy acknowledging what they were trying to customize.
   */
  featureKey?: 'customAccentColor' | 'iCloudSync'
}

const SupporterInfoSheet = ({ open, setOpen, featureKey }: Props) => {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  // Keep the native Modal mounted through the Sheet's dismiss animation so it
  // can slide down instead of disappearing instantly when `open` flips false.
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) {
      setMounted(true)
      return
    }
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

  const title = featureKey
    ? i18n.t('supporterGateSheetTitle')
    : i18n.t('supporterSheetTitle')
  const subtitle = featureKey
    ? i18n.t('supporterGateSheetSubtitle')
    : i18n.t('supporterSheetSubtitle')

  const handleDonatePress = () => {
    setOpen(false)
    navigation.navigate('Paywall')
  }

  // Wrap the tamagui Sheet in a RN Modal so the sheet is hosted in a new
  // UIWindow. Without this, the Sheet's portal mounts behind any parent
  // native modal / form sheet presentation and the gate is invisible when
  // `IsSupporter` is used inside a deeply nested/modal screen (e.g. the
  // AvatarPicker popover).
  return (
    <Modal
      visible={mounted}
      transparent
      statusBarTranslucent
      animationType='none'
      onRequestClose={() => setOpen(false)}
    >
      <Sheet
        open={open}
        onOpenChange={setOpen}
        dismissOnSnapToBottom
        modal={false}
        snapPoints={[90]}
      >
        <Sheet.Handle />
        <Sheet.Overlay zIndex={100_000 - 1} />
        <Sheet.Frame>
          <ScrollView
            contentContainerStyle={{ padding: 24, paddingBottom: 40, gap: 18 }}
          >
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <View style={{ flex: 1, gap: 8 }}>
                <SupporterBadge size='md' style={{ alignSelf: 'flex-start' }} />
                <Text
                  style={{
                    fontSize: theme.fontSize('2xl'),
                    fontFamily: theme.fonts.bold,
                    color: theme.colors.text,
                  }}
                >
                  {title}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: theme.colors.textAlt,
                    lineHeight: 20,
                  }}
                >
                  {subtitle}
                </Text>
              </View>
              <IconButton
                noTransform
                icon={faTimes}
                size='xl'
                onPress={() => setOpen(false)}
              />
            </View>

            <SupporterBenefits />

            <View style={{ gap: 10, marginTop: 6 }}>
              <Button
                noTransform
                style={{
                  backgroundColor: theme.colors.supporter,
                  borderRadius: theme.numbers.borderRadiusSm,
                  paddingVertical: 12,
                  paddingHorizontal: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={handleDonatePress}
              >
                <Text
                  style={{
                    fontSize: theme.fontSize('lg'),
                    color: theme.colors.textInverse,
                    fontFamily: theme.fonts.bold,
                  }}
                >
                  {i18n.t('supporterSheetLearnMore')}
                </Text>
              </Button>
              <Button
                noTransform
                style={{ alignSelf: 'center', paddingVertical: 8 }}
                onPress={() => setOpen(false)}
              >
                <Text
                  style={{
                    color: theme.colors.textAlt,
                    textDecorationLine: 'underline',
                  }}
                >
                  {i18n.t('supporterSheetDismiss')}
                </Text>
              </Button>
            </View>
          </ScrollView>
        </Sheet.Frame>
      </Sheet>
    </Modal>
  )
}

export default SupporterInfoSheet
