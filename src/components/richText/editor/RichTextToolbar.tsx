import { Fragment } from 'react'
import { ScrollView, View } from 'react-native'
import {
  Bold as BoldIcon,
  Heading1 as Heading1Icon,
  Heading2 as Heading2Icon,
  ImagePlus as ImagePlusIcon,
  Italic as ItalicIcon,
  KeyboardOff as KeyboardOffIcon,
  Link as LinkIcon,
  List as ListIcon,
  ListChecks as ListChecksIcon,
  ListIndentDecrease as OutdentIcon,
  ListIndentIncrease as IndentIcon,
  ListOrdered as ListOrderedIcon,
  Redo2 as RedoIcon,
  Strikethrough as StrikethroughIcon,
  Underline as UnderlineIcon,
  Undo2 as UndoIcon,
} from 'lucide-react-native'
import Button from '@/components/ui/Button'
import LucideIcon, { type AppIcon } from '@/components/ui/LucideIcon'
import PointerTooltip from '@/components/ui/PointerTooltip'
import PullDownMenu from '@/components/ui/PullDownMenu'
import type {
  EditorCommand,
  EditorFormatState,
} from '@/components/richText/editor/editorProtocol'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'

export const TOOLBAR_HEIGHT = 48
const BUTTON_SIZE = 40
const ICON_SIZE = 20

type Tool = {
  key: string
  icon: AppIcon
  label: string
  active?: boolean
  disabled?: boolean
  onPress: () => void
}

function ToolButton(props: { tool: Tool }) {
  const theme = useTheme()
  const { tool } = props
  return (
    <PointerTooltip label={tool.label} placement='top'>
      <Button
        noTransform
        onPress={tool.onPress}
        disabled={tool.disabled}
        accessibilityRole='button'
        accessibilityLabel={tool.label}
        accessibilityState={{
          selected: tool.active,
          disabled: tool.disabled,
        }}
        testID={`note-editor-${tool.key}`}
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          borderRadius: theme.numbers.borderRadiusMd,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tool.active
            ? theme.colors.accentTranslucent
            : 'transparent',
          opacity: tool.disabled ? 0.35 : 1,
        }}
      >
        <LucideIcon
          icon={tool.icon}
          size={ICON_SIZE}
          color={tool.active ? theme.colors.accent : theme.colors.text}
        />
      </Button>
    </PointerTooltip>
  )
}

function GroupDivider() {
  const theme = useTheme()
  return (
    <View
      style={{
        width: 1,
        height: 22,
        marginHorizontal: 4,
        alignSelf: 'center',
        backgroundColor: theme.colors.border,
      }}
    />
  )
}

/**
 * The note editor's formatting bar. It rides on top of the keyboard (or sits at
 * the bottom when there's none, e.g. with a hardware keyboard). The tools
 * scroll sideways when they don't fit; dismissing the keyboard stays pinned on
 * the right. The same bar on iOS and Android.
 */
const RichTextToolbar = (props: {
  format: EditorFormatState
  run: (command: EditorCommand) => void
  onLink: () => void
  /** Hidden when photos can't be added to this note. */
  onAddPhoto?: (source: 'camera' | 'library') => void
  onDismissKeyboard: () => void
  keyboardVisible: boolean
}) => {
  const theme = useTheme()
  const { format, run } = props
  const inList = format.list !== null

  const groups: Tool[][] = [
    [
      {
        key: 'bold',
        icon: BoldIcon,
        label: i18n.t('richText_bold'),
        active: format.bold,
        onPress: () => run({ type: 'toggleMark', mark: 'bold' }),
      },
      {
        key: 'italic',
        icon: ItalicIcon,
        label: i18n.t('richText_italic'),
        active: format.italic,
        onPress: () => run({ type: 'toggleMark', mark: 'italic' }),
      },
      {
        key: 'underline',
        icon: UnderlineIcon,
        label: i18n.t('richText_underline'),
        active: format.underline,
        onPress: () => run({ type: 'toggleMark', mark: 'underline' }),
      },
      {
        key: 'strike',
        icon: StrikethroughIcon,
        label: i18n.t('richText_strikethrough'),
        active: format.strike,
        onPress: () => run({ type: 'toggleMark', mark: 'strike' }),
      },
    ],
    [
      {
        key: 'heading1',
        icon: Heading1Icon,
        label: i18n.t('richText_heading'),
        active: format.block === 'heading1',
        onPress: () => run({ type: 'setBlock', block: 'heading1' }),
      },
      {
        key: 'heading2',
        icon: Heading2Icon,
        label: i18n.t('richText_subheading'),
        active: format.block === 'heading2',
        onPress: () => run({ type: 'setBlock', block: 'heading2' }),
      },
    ],
    [
      {
        key: 'bulletList',
        icon: ListIcon,
        label: i18n.t('richText_bulletList'),
        active: format.list === 'bulletList',
        onPress: () => run({ type: 'toggleList', list: 'bulletList' }),
      },
      {
        key: 'orderedList',
        icon: ListOrderedIcon,
        label: i18n.t('richText_numberedList'),
        active: format.list === 'orderedList',
        onPress: () => run({ type: 'toggleList', list: 'orderedList' }),
      },
      {
        key: 'taskList',
        icon: ListChecksIcon,
        label: i18n.t('richText_checklist'),
        active: format.list === 'taskList',
        onPress: () => run({ type: 'toggleList', list: 'taskList' }),
      },
      {
        key: 'outdent',
        icon: OutdentIcon,
        label: i18n.t('richText_outdent'),
        disabled: !inList || !format.canOutdent,
        onPress: () => run({ type: 'outdent' }),
      },
      {
        key: 'indent',
        icon: IndentIcon,
        label: i18n.t('richText_indent'),
        disabled: !inList || !format.canIndent,
        onPress: () => run({ type: 'indent' }),
      },
    ],
    [
      {
        key: 'link',
        icon: LinkIcon,
        label: i18n.t('richText_link'),
        active: !!format.link,
        onPress: props.onLink,
      },
    ],
    [
      {
        key: 'undo',
        icon: UndoIcon,
        label: i18n.t('richText_undo'),
        disabled: !format.canUndo,
        onPress: () => run({ type: 'undo' }),
      },
      {
        key: 'redo',
        icon: RedoIcon,
        label: i18n.t('richText_redo'),
        disabled: !format.canRedo,
        onPress: () => run({ type: 'redo' }),
      },
    ],
  ]

  const { onAddPhoto } = props
  const photoButton = onAddPhoto && (
    <PullDownMenu
      accessibilityLabel={i18n.t('richText_addPhoto')}
      hitSlop={0}
      actions={[
        {
          id: 'camera',
          title: i18n.t('richText_takePhoto'),
          systemImage: 'camera',
          onPress: () => onAddPhoto('camera'),
        },
        {
          id: 'library',
          title: i18n.t('richText_choosePhoto'),
          systemImage: 'photo.on.rectangle',
          onPress: () => onAddPhoto('library'),
        },
      ]}
    >
      <View
        testID='note-editor-photo'
        style={{
          width: BUTTON_SIZE,
          height: BUTTON_SIZE,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LucideIcon
          icon={ImagePlusIcon}
          size={ICON_SIZE}
          color={theme.colors.text}
        />
      </View>
    </PullDownMenu>
  )

  return (
    <View
      style={{
        height: TOOLBAR_HEIGHT,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.colors.card,
        borderTopWidth: 1,
        borderTopColor: theme.colors.border,
      }}
      accessibilityRole='toolbar'
      accessibilityLabel={i18n.t('richText_formatting')}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps='always'
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          alignItems: 'center',
          paddingHorizontal: 6,
          gap: 2,
        }}
        style={{ flex: 1 }}
      >
        {groups.map((group, index) => (
          <Fragment key={group[0]?.key ?? index}>
            {index > 0 && <GroupDivider />}
            {group.map((tool) => (
              <ToolButton key={tool.key} tool={tool} />
            ))}
            {group[0]?.key === 'link' && photoButton}
          </Fragment>
        ))}
      </ScrollView>
      {props.keyboardVisible && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 4,
            borderLeftWidth: 1,
            borderLeftColor: theme.colors.border,
          }}
        >
          <ToolButton
            tool={{
              key: 'dismiss',
              icon: KeyboardOffIcon,
              label: i18n.t('richText_hideKeyboard'),
              onPress: props.onDismissKeyboard,
            }}
          />
        </View>
      )}
    </View>
  )
}

export default RichTextToolbar
