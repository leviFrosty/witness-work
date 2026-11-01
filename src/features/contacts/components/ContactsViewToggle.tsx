import { StyleProp, ViewStyle } from 'react-native'
import i18n from '@/lib/locales'
import { ContactsView } from '@/types/homeStack'
import SegmentedControl from '@/components/ui/SegmentedControl'

const ContactsViewToggle = ({
  value,
  onChange,
  disabled,
  style,
}: {
  value: ContactsView
  onChange: (view: ContactsView) => void
  disabled?: boolean

  style?: StyleProp<ViewStyle>
}) => (
  <SegmentedControl<ContactsView>
    variant='pill'
    size='field'
    value={value}
    onChange={onChange}
    disabled={disabled}
    fitContent={style === undefined}
    style={style}
    testID='contacts-view'
    options={[
      {
        key: 'list',
        label: i18n.t('contacts_view_list'),
        testID: 'contacts-view-list',
      },
      { key: 'map', label: i18n.t('map'), testID: 'contacts-view-map' },
    ]}
  />
)

export default ContactsViewToggle
