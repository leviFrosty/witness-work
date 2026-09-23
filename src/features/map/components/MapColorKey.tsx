import StalenessColorKey from '@/components/StalenessColorKey'
import Text from '@/components/ui/MyText'
import i18n from '@/lib/locales'

export default function MapKey() {
  return (
    <>
      <StalenessColorKey />
      <Text style={{ marginTop: 12 }}>{i18n.t('map_dropPinHint')}</Text>
    </>
  )
}
