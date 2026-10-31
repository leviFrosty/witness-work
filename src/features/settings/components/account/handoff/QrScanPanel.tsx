import { useEffect, useRef, useState } from 'react'
import { Linking, View } from 'react-native'
import { CameraView, useCameraPermissions } from 'expo-camera'
import ActionButton from '@/components/ui/ActionButton'
import Card from '@/components/ui/Card'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n, { type TranslationKey } from '@/lib/locales'

const VIEWFINDER_SIZE = 280

/**
 * Scans a QR code inside the app. Camera access is asked for only once this is
 * open; when it's denied, the panel points to Settings. `read` takes a scan and
 * answers what's wrong with it, or null once it's taken, which stops scanning.
 */
export default function QrScanPanel({
  read,
  hint,
  deniedBody,
  problem: initialProblem = null,
  testIDPrefix,
}: {
  read: (data: string) => TranslationKey | null
  hint: TranslationKey
  deniedBody: TranslationKey
  /** What was wrong with the last code, shown in place of the hint. */
  problem?: TranslationKey | null
  testIDPrefix: string
}) {
  const theme = useTheme()
  const [permission, requestPermission] = useCameraPermissions()
  const [problem, setProblem] = useState<TranslationKey | null>(initialProblem)
  const handled = useRef(false)

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain)
      void requestPermission()
  }, [permission, requestPermission])

  const scanned = (data: string) => {
    if (handled.current) return
    const found = read(data)
    if (found) {
      setProblem(found)
      return
    }
    handled.current = true
  }

  const denied = permission && !permission.granted && !permission.canAskAgain

  if (denied)
    return (
      <Card style={{ gap: 12 }} testID={`${testIDPrefix}-camera-denied`}>
        <Text style={{ fontFamily: theme.fonts.semiBold }}>
          {i18n.t('buddies_cameraDeniedTitle')}
        </Text>
        <Text style={{ color: theme.colors.textAlt }}>
          {i18n.t(deniedBody)}
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
        testID={`${testIDPrefix}-scan-hint`}
        style={{
          textAlign: 'center',
          maxWidth: 320,
          color: problem ? theme.colors.error : theme.colors.text,
        }}
      >
        {i18n.t(problem ?? hint)}
      </Text>
    </View>
  )
}
