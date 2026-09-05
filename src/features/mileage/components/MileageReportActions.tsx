import { useState } from 'react'
import { Alert, Share, View } from 'react-native'
import { Copy, Share as ShareIcon } from 'lucide-react-native'
import * as Clipboard from 'expo-clipboard'
import Button from '@/components/ui/Button'
import Text from '@/components/ui/MyText'
import LucideIcon from '@/components/ui/LucideIcon'
import SegmentedControl from '@/components/ui/SegmentedControl'
import useTheme from '@/contexts/theme'
import { usePreferences } from '@/stores/preferences'
import i18n from '@/lib/locales'
import { exportMileageSummary } from '@/features/mileage/lib/exportSummary'

export default function MileageReportActions({ text }: { text: string }) {
  const theme = useTheme()
  const { mileageSubmissionMethod, setMileageSubmissionMethod } =
    usePreferences()
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<string>()
  const exportReport = async () => {
    setBusy(true)
    setConfirmation(undefined)
    try {
      const result = await exportMileageSummary(text, mileageSubmissionMethod, {
        copy: Clipboard.setStringAsync,
        share: async (message) => {
          const result = await Share.share({ message })
          return result.action === Share.sharedAction ? 'shared' : 'dismissed'
        },
      })
      if (result !== 'dismissed')
        setConfirmation(
          i18n.t(
            result === 'copied'
              ? 'mileage.report.copied'
              : 'mileage.report.shared'
          )
        )
    } catch {
      Alert.alert(i18n.t('mileage.report.exportFailed'))
    } finally {
      setBusy(false)
    }
  }
  return (
    <View style={{ gap: 12, paddingHorizontal: 15 }}>
      <SegmentedControl
        variant='pill'
        value={mileageSubmissionMethod}
        onChange={(value) => {
          setMileageSubmissionMethod(value)
          setConfirmation(undefined)
        }}
        options={[
          { key: 'copy', label: i18n.t('mileage.report.copy') },
          { key: 'share', label: i18n.t('mileage.report.share') },
        ]}
      />
      <Button
        disabled={busy}
        onPress={exportReport}
        style={{
          backgroundColor: theme.colors.accent,
          borderRadius: theme.numbers.borderRadiusSm,
          padding: 14,
          flexDirection: 'row',
          gap: 8,
        }}
      >
        <LucideIcon
          icon={mileageSubmissionMethod === 'copy' ? Copy : ShareIcon}
          color={theme.colors.textInverse}
          size={18}
        />
        <Text
          style={{
            color: theme.colors.textInverse,
            flexShrink: 1,
            fontFamily: theme.fonts.semiBold,
          }}
        >
          {i18n.t(
            mileageSubmissionMethod === 'copy'
              ? 'mileage.report.copySummary'
              : 'mileage.report.shareSummary'
          )}
        </Text>
      </Button>
      {confirmation && (
        <Text
          accessibilityLiveRegion='polite'
          style={{ textAlign: 'center', color: theme.colors.accent }}
        >
          {confirmation}
        </Text>
      )}
      <Text
        style={{
          color: theme.colors.textAlt,
          fontSize: theme.fontSize('sm'),
          lineHeight: 20,
        }}
      >
        {i18n.t('mileage.report.guidance')}
      </Text>
    </View>
  )
}
