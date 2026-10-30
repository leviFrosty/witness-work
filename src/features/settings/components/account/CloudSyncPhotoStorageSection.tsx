import { View } from 'react-native'
import { Image as ImageIcon } from 'lucide-react-native'
import Section from '@/components/ui/inputs/Section'
import InputRowContainer from '@/components/ui/inputs/InputRowContainer'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import useCloudSyncPhotoStorage from '@/features/settings/hooks/useCloudSyncPhotoStorage'
import { alignText } from '@/lib/direction'
import { formatBytes } from '@/lib/formatBytes'
import i18n from '@/lib/locales'

/**
 * Settings → Account: the account's Cloud Sync photo storage, "2.1 MB of 2 GB",
 * and "Storage full" (ADR 0040 §6), while this device is on Cloud Sync.
 */
export default function CloudSyncPhotoStorageSection() {
  const theme = useTheme()
  const { shown, usage, full } = useCloudSyncPhotoStorage()
  if (!shown) return null

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
          {usage && (
            <Text
              testID='cloud-sync-photo-storage-usage'
              style={{
                fontSize: theme.fontSize('sm'),
                color: theme.colors.textAlt,
                textAlign: alignText('end'),
              }}
            >
              {i18n.t('cloudSyncPhotoStorage_usage', {
                used: formatBytes(usage.bytes),
                limit: formatBytes(usage.limit),
              })}
            </Text>
          )}
        </View>
      </InputRowContainer>
    </Section>
  )
}
