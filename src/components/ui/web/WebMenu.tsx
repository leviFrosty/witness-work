import {
  type CSSProperties,
  type KeyboardEvent,
  Fragment,
  useEffect,
  useRef,
  useState,
} from 'react'
import useTheme from '@/contexts/theme'
import i18n from '@/lib/locales'
import { isRtlLayout } from '@/lib/direction'
import { isSubmenu } from '@/components/ui/menuEntries'
import { MIN_TOUCH_TARGET } from '@/components/ui/touchTarget'
import { nextMenuIndex, typeaheadIndex } from '@/components/ui/web/menuKeys'
import type {
  ContextMenuAction,
  ContextMenuItem,
  ContextMenuSubmenu,
} from '@/components/ui/ContextMenu.types'

type Row = {
  key: string
  title: string
  kind: 'action' | 'submenu' | 'back'
  /** Rows of one group sit together; a separator divides groups. */
  group: number
  activate: () => void
  entry?: ContextMenuAction
}

type Props = {
  groups: ContextMenuItem[][]
  /** Closes the menu and runs the action. */
  onSelect: (action: ContextMenuAction) => void
}

const itemNodes = (list: HTMLElement | null) =>
  list ? [...list.querySelectorAll<HTMLElement>('[data-menu-item]')] : []

/**
 * The contents of a `PullDownMenu` or `ContextMenu` on the web: a WAI-ARIA
 * menu. Arrow keys, Home and End move between items, typing a letter jumps to
 * one, Enter or Space picks it, and a submenu replaces the items in place, led
 * by a Back item (Arrow Left, or Right in right to left, goes back too).
 * Checked actions are radio items.
 */
export default function WebMenu({ groups, onSelect }: Props) {
  const theme = useTheme()
  const rtl = isRtlLayout()
  const listRef = useRef<HTMLDivElement>(null)
  // Whether an item has had a key pressed on it. The key that opened the menu
  // goes up on the item it focuses, which mustn't press it.
  const keyPressed = useRef(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  const [active, setActive] = useState(-1)
  // The item that opened the submenu, which focus goes back to on leaving it.
  const parentKey = useRef<string | null>(null)

  const shownGroups = submenu ? [submenu.actions] : groups

  // Once the menu is open, a submenu's first item takes focus. The first
  // render is the layer's job: it focuses `data-initial-focus` once placed.
  const opened = useRef(false)
  useEffect(() => {
    if (!opened.current) {
      opened.current = true
      return
    }
    const nodes = itemNodes(listRef.current)
    const parent = nodes.findIndex(
      (node) => node.dataset.testid === `menu-item-${parentKey.current}`
    )
    const index = submenu ? 1 : Math.max(parent, 0)
    nodes[index]?.focus()
    setActive(index)
  }, [submenu])

  const move = (index: number) => {
    const node = itemNodes(listRef.current)[index]
    if (!node) return
    node.focus()
    setActive(index)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') keyPressed.current = true
    const nodes = itemNodes(listRef.current)
    const current = nodes.indexOf(document.activeElement as HTMLElement)
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    if (event.key === back && submenu) {
      event.preventDefault()
      setSubmenu(null)
      return
    }
    const target = nextMenuIndex(event.key, current, nodes.length)
    if (target !== null) {
      event.preventDefault()
      move(target)
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const labels = nodes.map((node) => node.textContent ?? '')
    const jump = typeaheadIndex(labels, current, event.key)
    if (jump !== null) {
      event.preventDefault()
      move(jump)
    }
  }

  const pressed = (activate: () => void) => (event: React.MouseEvent) => {
    event.stopPropagation()
    if (event.detail === 0 && !keyPressed.current) return
    activate()
  }

  const rows: Row[] = [
    ...(submenu
      ? [
          {
            key: 'back',
            title: submenu.title,
            kind: 'back' as const,
            group: -1,
            activate: () => setSubmenu(null),
          },
        ]
      : []),
    ...shownGroups.flatMap((group, groupIndex) =>
      group.map(
        (entry): Row =>
          isSubmenu(entry)
            ? {
                key: entry.id,
                title: entry.title,
                kind: 'submenu',
                group: groupIndex,
                activate: () => {
                  parentKey.current = entry.id
                  setSubmenu(entry)
                },
              }
            : {
                key: entry.id,
                title: entry.title,
                kind: 'action',
                group: groupIndex,
                activate: () => onSelect(entry),
                entry,
              }
      )
    ),
  ]

  // Focus lands on the chosen item (a selection menu), else the first.
  const checkedRow = rows.findIndex((row) => row.entry?.checked)
  const initialRow = submenu ? 1 : Math.max(checkedRow, 0)

  return (
    <div
      ref={listRef}
      onKeyDown={onKeyDown}
      style={{ padding: 4, minWidth: 180, maxWidth: 320 }}
    >
      {rows.map((row, index) => {
        const { key, title, kind, activate, entry } = row
        const destructive = entry?.destructive === true
        const checked = entry?.checked
        const style: CSSProperties = {
          display: 'flex',
          alignItems: 'center',
          width: '100%',
          boxSizing: 'border-box',
          minHeight: MIN_TOUCH_TARGET,
          padding: '6px 12px',
          border: 'none',
          borderRadius: theme.numbers.borderRadiusSm + 2,
          background:
            active === index
              ? `color-mix(in srgb, ${theme.colors.text} 9%, transparent)`
              : 'transparent',
          color: destructive ? theme.colors.error : theme.colors.text,
          font: `${theme.fontSize('md')}px ${theme.fonts.regular}, system-ui, sans-serif`,
          textAlign: 'start',
          cursor: 'pointer',
          outline: 'none',
          gap: 8,
        }
        return (
          <Fragment key={key}>
            {index > 0 && rows[index - 1]!.group !== row.group ? (
              <Separator color={theme.colors.border} />
            ) : null}
            <button
              type='button'
              role={checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={checked === undefined ? undefined : checked}
              aria-haspopup={kind === 'submenu' ? 'menu' : undefined}
              aria-label={kind === 'back' ? i18n.t('goBack') : undefined}
              data-menu-item=''
              data-initial-focus={index === initialRow ? '' : undefined}
              data-checked={checked === undefined ? undefined : String(checked)}
              data-testid={`menu-item-${key}`}
              tabIndex={
                index === active || (active < 0 && index === 0) ? 0 : -1
              }
              style={style}
              onClick={pressed(activate)}
              onFocus={() => setActive(index)}
              onPointerMove={(event) => {
                if (event.pointerType !== 'touch' && active !== index)
                  move(index)
              }}
              onKeyDown={(event) => {
                if (
                  kind === 'submenu' &&
                  event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
                ) {
                  event.preventDefault()
                  activate()
                }
              }}
            >
              {kind === 'back' ? <Chevron flip={!rtl} /> : null}
              <span style={{ flex: 1 }}>{title}</span>
              {checked ? <Check /> : null}
              {kind === 'submenu' ? <Chevron flip={rtl} /> : null}
            </button>
          </Fragment>
        )
      })}
    </div>
  )
}

function Separator({ color }: { color: string }) {
  return (
    <div
      role='separator'
      style={{ height: 1, margin: '4px 0', background: color }}
    />
  )
}

const iconStyle: CSSProperties = { flexShrink: 0 }

function Check() {
  return (
    <svg
      aria-hidden
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      style={iconStyle}
    >
      <path d='M20 6 9 17l-5-5' />
    </svg>
  )
}

function Chevron({ flip }: { flip: boolean }) {
  return (
    <svg
      aria-hidden
      width='16'
      height='16'
      viewBox='0 0 24 24'
      fill='none'
      stroke='currentColor'
      strokeWidth='2.5'
      strokeLinecap='round'
      strokeLinejoin='round'
      style={{ ...iconStyle, transform: flip ? 'scaleX(-1)' : undefined }}
    >
      <path d='m9 6 6 6-6 6' />
    </svg>
  )
}
