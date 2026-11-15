import { View } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Image as ImageIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowButton from '@/components/ui/inputs/InputRowButton'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import { inputLayout, RowSeparator } from '@/components/ui/inputs/InputLayout'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import PhotoStorageBar from '@/features/settings/components/account/PhotoStorageBar'
import useCloudSyncPhotoStorage from '@/features/settings/hooks/useCloudSyncPhotoStorage'
import usePhotoStorageBreakdown from '@/features/settings/hooks/usePhotoStorageBreakdown'
import { alignText } from '@/lib/direction'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'
import type { RootStackNavigation } from '@/types/rootStack'

export default function CloudSyncPhotoStorageSection() {
  const theme = useTheme()
  const navigation = useNavigation<RootStackNavigation>()
  const { shown, usage, full } = useCloudSyncPhotoStorage()
  const { breakdown } = usePhotoStorageBreakdown(shown)
  if (!shown) return null

  const used = breakdown?.used ?? usage?.bytes ?? 0
  const limit = breakdown?.limit || usage?.limit || 0

  return (
    <Section>
      <InputRowContainer
        leftIcon={ImageIcon}
        label={i18n.t('cloudSyncPhotoStorage')}
        info={i18n.t(
          full ? 'cloudSyncPhotoStorage_fullInfo' : 'cloudSyncPhotoStorage_info'
        )}
        controlWidth='auto'
        style={{ justifyContent: 'space-between' }}
        lastInSection
      >
        <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
          {full && (
            <Text
              testID='cloud-sync-photo-storage-full'
              style={{
                fontFamily: theme.fonts.semiBold,
                color: theme.colors.warnText,
                textAlign: alignText('end'),
              }}
            >
              {i18n.t('cloudSyncPhotoStorage_full')}
            </Text>
          )}
          {limit > 0 && (
            <Text
              testID='cloud-sync-photo-storage-usage'
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                textAlign: alignText('end'),
              }}
            >
              {i18n.t('cloudSyncPhotoStorage_usage', {
                used: formatBytes(used),
                limit: formatBytes(limit),
              })}
            </Text>
          )}
        </View>
      </InputRowContainer>
      {limit > 0 && (
        <View
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingBottom: inputLayout.rowPadding + 4,
          }}
        >
          <PhotoStorageBar
            categories={breakdown?.categories ?? null}
            used={used}
            limit={limit}
          />
          <RowSeparator />
        </View>
      )}
      <InputRowButton
        label={i18n.t('photoStorage_manage')}
        onPress={() => navigation.navigate('Photo Storage')}
        testID='photo-storage-manage'
        lastInSection
      />
    </Section>
  )
}
