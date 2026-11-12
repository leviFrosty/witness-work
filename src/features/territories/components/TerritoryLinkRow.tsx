import { useState } from 'react'
import { View } from 'react-native'
import { Link as LinkIcon, Trash2 as TrashIcon } from 'lucide-react-native'
import Button from '@/components/ui/Button'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import TextInputRow from '@/components/ui/inputs/TextInputRow'
import LucideIcon from '@/components/ui/LucideIcon'
import Text from '@/components/ui/MyText'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import TerritoryMapRow from '@/features/territories/components/TerritoryMapRow'
import { mapLinkHost } from '@/features/territories/lib/mapLinkHost'

export default function TerritoryLinkRow({
  link,
  finding,
  onChange,
  onEntered,
}: {
  link: string
  finding: boolean
  onChange: (link: string) => void
  onEntered: (link: string) => void
}) {
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const set = !!link.trim()

  return (
    <View>
      <TerritoryMapRow
        icon={LinkIcon}
        label={i18n.t('territories.map.linkRow')}
        sublabel={
          finding
            ? i18n.t('territories.linkFinding')
            : set
              ? undefined
              : i18n.t('territories.map.linkRow_description')
        }
        done={set}
        value={set && !open ? mapLinkHost(link) : undefined}
        opens={open ? 'expanded' : 'collapsed'}
        onPress={() => setOpen((value) => !value)}
        testID='territory-link-row'
      />
      {open && (
        <View testID='territory-link-panel' style={{ paddingBottom: 12 }}>
          <TextInputRow
            label={i18n.t('territories.linkLabel')}
            controlWidth='full'
            lastInSection
            textInputProps={{
              value: link,
              onChangeText: onChange,
              onEndEditing: () => onEntered(link),
              placeholder: i18n.t('territories.linkPlaceholder'),
              autoFocus: !set,
              autoCapitalize: 'none',
              autoCorrect: false,
              keyboardType: 'url',
              textAlign: 'start',
              testID: 'territory-link',
            }}
          />
          {set && (
            <Button
              variant='outline'
              onPress={() => onChange('')}
              testID='territory-link-remove'
              style={{
                marginTop: 4,
                marginHorizontal: inputLayout.horizontalPadding,
                minHeight: 44,
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                borderRadius: 22,
              }}
            >
              <LucideIcon
                icon={TrashIcon}
                size={16}
                color={theme.colors.error}
              />
              <Text
                style={{
                  fontFamily: theme.fonts.semiBold,
                  color: theme.colors.error,
                }}
              >
                {i18n.t('territories.map.removeLink')}
              </Text>
            </Button>
          )}
        </View>
      )}
    </View>
  )
}
