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
import LucideIcon from '@/components/ui/LucideIcon'
import webMenuIcons from '@/components/ui/web/webMenuIcons'
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

  group: number
  activate: () => void
  entry?: ContextMenuAction
  systemImage?: ContextMenuItem['systemImage']
}

type Props = {
  groups: ContextMenuItem[][]

  onSelect: (action: ContextMenuAction) => void
}

export const MENU_MAX_WIDTH = 320

const ICON_SIZE = 18

const iconFor = (systemImage: ContextMenuItem['systemImage']) =>
  systemImage ? webMenuIcons[systemImage] : undefined

const itemNodes = (list: HTMLElement | null) =>
  list ? [...list.querySelectorAll<HTMLElement>('[data-menu-item]')] : []

export default function WebMenu({ groups, onSelect }: Props) {
  const theme = useTheme()
  const rtl = isRtlLayout()
  const listRef = useRef<HTMLDivElement>(null)

  const keyPressed = useRef(false)
  const [submenu, setSubmenu] = useState<ContextMenuSubmenu | null>(null)
  const [active, setActive] = useState(-1)

  const parentKey = useRef<string | null>(null)

  const shownGroups = submenu ? [submenu.actions] : groups

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
                systemImage: entry.systemImage,
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
                systemImage: entry.systemImage,
              }
      )
    ),
  ]

  const indent = rows.some((row) => iconFor(row.systemImage))

  const checkedRow = rows.findIndex((row) => row.entry?.checked)
  const initialRow = submenu ? 1 : Math.max(checkedRow, 0)

  return (
    <div
      ref={listRef}
      onKeyDown={onKeyDown}
      style={{ padding: 4, minWidth: 180, maxWidth: MENU_MAX_WIDTH }}
    >
      {rows.map((row, index) => {
        const { key, title, kind, activate, entry } = row
        const destructive = entry?.destructive === true
        const color = destructive ? theme.colors.error : theme.colors.text
        const icon = iconFor(row.systemImage)
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
          color,
          font: `${theme.fontSize('md')}px ${theme.fonts.regular}, system-ui, sans-serif`,
          textAlign: 'start',
          cursor: 'pointer',
          outline: 'none',
          gap: 10,
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
              {kind === 'back' ? (
                <Chevron flip={!rtl} />
              ) : indent ? (
                <span
                  aria-hidden
                  data-menu-icon={icon ? row.systemImage : undefined}
                  style={iconSlotStyle}
                >
                  {icon ? (
                    <LucideIcon icon={icon} color={color} size={ICON_SIZE} />
                  ) : null}
                </span>
              ) : null}
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

const iconSlotStyle: CSSProperties = {
  display: 'flex',
  flexShrink: 0,
  width: ICON_SIZE,
  height: ICON_SIZE,
}

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
