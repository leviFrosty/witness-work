import { Plus as PlusIcon } from 'lucide-react-native'
import RootHeader from '@/components/RootHeader'
import IconButton from '@/components/ui/IconButton'
import PointerTooltip from '@/components/ui/PointerTooltip'
import ScrollAwayHeader from '@/components/ui/ScrollAwayHeader'
import { inputLayout } from '@/components/ui/inputs/InputLayout'
import { useFoldColumn } from '@/components/ui/layout/FoldPane'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export default function TerritoriesTabHeader({
  hidden,
  onAdd,
}: {
  hidden: boolean
  onAdd: () => void
}) {
  const theme = useTheme()
  const foldColumn = useFoldColumn(inputLayout.contentMaxWidth)
  const label = i18n.t('territories.add')

  return (
    <ScrollAwayHeader hidden={hidden}>
      <RootHeader
        title={i18n.t('territories.title')}
        contentStyle={[{ maxWidth: inputLayout.contentMaxWidth }, foldColumn]}
        actions={
          <PointerTooltip label={label} effect='none'>
            <IconButton
              icon={PlusIcon}
              size='lg'
              accessibilityLabel={label}
              testID='territories-add'
              frame
              style={{
                backgroundColor: theme.colors.accentTranslucent,
                justifyContent: 'center',
                alignItems: 'center',
                width: 44,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderColor: theme.colors.accent,
              }}
              color={theme.colors.accent}
              onPress={onAdd}
            />
          </PointerTooltip>
        }
      />
    </ScrollAwayHeader>
  )
}
