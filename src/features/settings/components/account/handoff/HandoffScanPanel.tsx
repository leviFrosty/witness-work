import { useEffect, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'
import {
  type HandoffOffer,
  parseHandoffLink,
  type ParsedHandoffLink,
} from '@/lib/serverAccount/handoff'

const VIEWFINDER_SIZE = 280

const PROBLEM: Record<
  Extract<ParsedHandoffLink, { ok: false }>['problem'],
  TranslationKey
> = {
  notHandoff: 'handoff_scanNotHandoff',
  version: 'handoff_scanVersion',
  damaged: 'handoff_scanDamaged',
}

export default function HandoffScanPanel({
  onOffer,
}: {
  onOffer: (offer: HandoffOffer) => void
}) {
  const theme = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [problem, setProblem] = useState<TranslationKey | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain)
      void requestPermission()
  }, [permission, requestPermission])

  const scanned = (data: string) => {
    if (handled.current) return
    const parsed = parseHandoffLink(data)
    if (!parsed.ok) {
      setProblem(PROBLEM[parsed.problem])
      return
    }
    handled.current = true
    onOffer(parsed.offer)
  }

  const denied = permission && !permission.granted && !permission.canAskAgain

  if (denied)
    return (
      <Card style={{ gap: 12 }} testID='handoff-camera-denied'>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('buddies_cameraDeniedTitle')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t('handoff_cameraDeniedBody')}
        </Text>
        <ActionButton onPress={() => void Linking.openSettings()}>
          {i18n.t('buddies_openSettings')}
        </ActionButton>
      </Card>
    )

  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      {permission?.granted && (
        <View
          style={{
            width: VIEWFINDER_SIZE,
            height: VIEWFINDER_SIZE,
            borderRadius: theme.numbers.borderRadiusLg,
            overflow: 'hidden',
            backgroundColor: '#000000',
          }}
        >
          <CameraView
            style={{ flex: 1 }}
            facing='back'
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => scanned(data)}
          />
        </View>
      )}
      <Text
        accessibilityLiveRegion='polite'
        testID='handoff-scan-hint'
        style={{
          textAlign: 'center',
          maxWidth: 320,
          color: problem ? theme.colors.error : theme.colors.text,
        }}
      >
        {i18n.t(problem ?? 'handoff_scanHint')}
      </Text>
    </View>
  )
}
