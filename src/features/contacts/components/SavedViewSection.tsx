import {
  BookmarkPlus as BookmarkPlusIcon,
  Bookmark as BookmarkIcon,
  X as XIcon,
} from 'lucide-react-native'
import { useState } from 'react'
import { View } from 'react-native'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import Button from '@/components/ui/Button'
import IconButton from '@/components/ui/IconButton'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import PointerTooltip from '@/components/ui/PointerTooltip'
import IsSupporter from '@/components/IsSupporter'
import useContactsQuery from '@/features/contacts/hooks/useContactsQuery'
import useSavedContactViews from '@/features/contacts/hooks/useSavedContactViews'
import { isDefaultContactsQuery } from '@/features/contacts/lib/savedViews'
import SavedViewNameInput from '@/features/contacts/components/SavedViewNameInput'

/**
 * Top of Sort & Filter: save what's set up below as a named view, or — while a
 * view is showing — save changes back to it or as a new one. Supporter-only;
 * everyone else sees the standard gate in its place.
 */
const SavedViewSection = () => {
  const theme = useTheme()
  const { query } = useContactsQuery()
  const { activeView, edited, select, saveCurrent, updateActive } =
    useSavedContactViews()
  const [naming, setNaming] = useState(false)

  const save = (name: string) => {
    if (saveCurrent(name)) setNaming(false)
  }

  const outlineButton = (
    label: string,
    onPress: () => void,
    options: { icon?: typeof BookmarkPlusIcon; disabled?: boolean } = {}
  ) => (
    <Button
      onPress={onPress}
      disabled={options.disabled}
      noTransform
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        paddingVertical: 12,
        borderRadius: theme.numbers.borderRadiusSm,
        borderWidth: 1,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.backgroundLighter,
        opacity: options.disabled ? 0.5 : 1,
      }}
    >
      {options.icon && (
        <LucideIcon
          icon={options.icon}
          size={theme.fontSize('sm')}
          style={{ color: theme.colors.text }}
        />
      )}
      <Text
        style={{
          fontSize: theme.fontSize('sm'),
          color: theme.colors.text,
          fontFamily: theme.fonts.semiBold,
        }}
      >
        {label}
      </Text>
    </Button>
  )

  const renderContent = () => {
    if (naming) {
      return (
        <SavedViewNameInput onSave={save} onDismiss={() => setNaming(false)} />
      )
    }
    if (!activeView) {
      return (
        <View style={{ flexDirection: 'row' }}>
          {outlineButton(
            i18n.t('savedViews_saveAsView'),
            () => setNaming(true),
            {
              icon: BookmarkPlusIcon,
              disabled: isDefaultContactsQuery(query),
            }
          )}
        </View>
      )
    }
    return (
      <View style={{ gap: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingLeft: 14,
            paddingRight: 6,
            paddingVertical: 4,
            borderRadius: theme.numbers.borderRadiusSm,
            borderWidth: 1,
            borderColor: theme.colors.accent,
            backgroundColor: theme.colors.accentTranslucent,
          }}
        >
          <LucideIcon
            icon={BookmarkIcon}
            size={theme.fontSize('sm')}
            style={{ color: theme.colors.accent }}
          />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: theme.fontSize('md'),
              color: theme.colors.accent,
              fontFamily: theme.fonts.semiBold,
            }}
          >
            {activeView.name}
          </Text>
          {edited && (
            <Text
              style={{
                fontSize: theme.fontSize('xs'),
                color: theme.colors.textAlt,
                fontFamily: theme.fonts.semiBold,
              }}
            >
              {i18n.t('savedViews_edited')}
            </Text>
          )}
          <PointerTooltip label={i18n.t('savedViews_close')} effect='none'>
            <IconButton
              icon={XIcon}
              size={18}
              color={theme.colors.accent}
              accessibilityLabel={i18n.t('savedViews_close')}
              onPress={() => select(null)}
              style={{ padding: 8 }}
            />
          </PointerTooltip>
        </View>
        {edited && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {outlineButton(i18n.t('savedViews_updateView'), updateActive)}
            {outlineButton(i18n.t('savedViews_saveAsNewView'), () =>
              setNaming(true)
            )}
          </View>
        )}
      </View>
    )
  }

  return (
    <IsSupporter
      feature='savedContactViews'
      analyticsSurface='saved_views'
      title={i18n.t('savedViews_title')}
    >
      {renderContent()}
    </IsSupporter>
  )
}

export default SavedViewSection
