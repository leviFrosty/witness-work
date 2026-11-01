import { Bookmark as BookmarkIcon } from 'lucide-react-native'
import { useEffect, useRef } from 'react'
import ContentColumn from '@/components/ui/layout/ContentColumn'
import type { InputRef } from 'tamagui'
import { NativeStackScreenProps } from '@react-navigation/native-stack'
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import useContacts from '@/stores/contactsStore'
import { RootStackParamList } from '@/types/rootStack'
import Wrapper from '@/components/ui/layout/Wrapper'
import Section from '@/components/ui/inputs/Section'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import Empty from '@/components/ui/Empty'
import LucideIcon from '@/components/ui/LucideIcon'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import SavedViewRow from '@/features/contacts/components/SavedViewRow'

type Props = NativeStackScreenProps<RootStackParamList, 'Saved Contact Views'>

const SavedViewsScreen = ({ navigation, route }: Props) => {
  const theme = useTheme()
  const { customFieldDefs } = useContacts()
  const { views, rename, move, confirmRemove } = useSavedContactViews()
  const focusRef = useRef<InputRef>(null)
  const focusId = route.params?.focusId

  useEffect(() => {
    if (!focusId) return
    return navigation.addListener('transitionEnd', (e) => {
      if (!e.data.closing) focusRef.current?.focus()
    })
  }, [navigation, focusId])

  return (
    <Wrapper insets='bottom'>
      <KeyboardAwareScrollView>
        <ContentColumn
          style={{
            paddingHorizontal: inputLayout.horizontalPadding,
            paddingVertical: 24,
          }}
        >
          {views.length === 0 ? (
            <Empty
              icon={
                <LucideIcon
                  icon={BookmarkIcon}
                  size={24}
                  color={theme.colors.text}
                />
              }
              title={i18n.t('savedViews_empty_title')}
              description={i18n.t('savedViews_empty_description')}
            />
          ) : (
            <Section>
              {views.map((view, index) => (
                <SavedViewRow
                  key={view.id}
                  view={view}
                  first={index === 0}
                  last={index === views.length - 1}
                  customFieldDefs={customFieldDefs}
                  inputRef={view.id === focusId ? focusRef : undefined}
                  onRename={(name) => rename(view.id, name)}
                  onMove={(direction) => move(view.id, direction)}
                  onDelete={() => confirmRemove(view.id)}
                />
              ))}
            </Section>
          )}
        </ContentColumn>
      </KeyboardAwareScrollView>
    </Wrapper>
  )
}

export default SavedViewsScreen
