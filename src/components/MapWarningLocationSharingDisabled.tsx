import { faTimes } from '@fortawesome/free-solid-svg-icons'
import useTheme from '../contexts/theme'
import i18n from '../lib/locales'
import Card from './Card'
import IconButton from './IconButton'
import XView from './layout/XView'
import Text from './MyText'
import { useState } from 'react'

export default function MapWarningLocationSharingDisabled(props: {
  hasLocationPermission: boolean
}) {
  const [show, setShow] = useState(true)
  const theme = useTheme()

  if (!show || props.hasLocationPermission) {
    return null
  }

  return (
    <Card style={{ position: 'absolute', top: 0, margin: 10, gap: 5 }}>
      <XView style={{ justifyContent: 'space-between' }}>
        <Text
          style={{
            fontFamily: theme.fonts.bold,
            fontSize: theme.fontSize('lg'),
          }}
        >
          {i18n.t('locationSharingDisabled')}
        </Text>
        <IconButton
          icon={faTimes}
          color={theme.colors.text}
          onPress={() => setShow(false)}
          size={'lg'}
        />
      </XView>
      <XView style={{ flexWrap: 'wrap' }}>
        <Text>{i18n.t('locationDisabled_description')}</Text>
        <Text style={{ textDecorationLine: 'underline' }}>
          {i18n.t('locationDisabled_callToAction')}
        </Text>
      </XView>
    </Card>
  )
}
