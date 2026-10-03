import { describe, expect, it, vi } from 'vitest'

vi.mock('react-native', () => ({ Platform: { OS: 'ios' }, View: 'View' }))
vi.mock('@react-native-menu/menu', () => ({ MenuView: 'MenuView' }))
vi.mock('lucide-react-native', () => ({ Ellipsis: 'Ellipsis' }))
vi.mock('@/components/ui/LucideIcon', () => ({ default: 'LucideIcon' }))
vi.mock('@/contexts/theme', () => ({ default: () => ({ colors: {} }) }))
vi.mock('@/stores/preferences', () => ({ usePreferences: () => undefined }))
vi.mock('@/lib/analytics', () => ({ analytics: { capture: vi.fn() } }))

import { nativeMenuActions } from '@/components/ui/PullDownMenu'
import { menuGroups } from '@/components/ui/menuEntries'
import type { ContextMenuEntries } from '@/components/ui/ContextMenu.types'

const noop = () => {}
const colors = { color: '#text', destructiveColor: '#err' }

// Contact Details' More menu: Share…, Edit | Dismiss For ▸, Archive.
const contactMore: ContextMenuEntries = [
  [
    {
      id: 'share',
      title: 'Share…',
      systemImage: 'square.and.arrow.up',
      onPress: noop,
    },
    { id: 'edit', title: 'Edit', systemImage: 'pencil', onPress: noop },
  ],
  [
    {
      id: 'dismiss',
      title: 'Dismiss For',
      systemImage: 'clock',
      actions: [
        { id: '1_week', title: '1 Week', onPress: noop },
        { id: '1_month', title: '1 Month', onPress: noop },
      ],
    },
    {
      id: 'archive',
      title: 'Archive',
      systemImage: 'archivebox',
      destructive: true,
      onPress: noop,
    },
  ],
]

describe('nativeMenuActions', () => {
  it('never nests a submenu inside an inline group on iOS', () => {
    const actions = nativeMenuActions(menuGroups(contactMore), {
      ios: true,
      ...colors,
    })
    // The Fabric bridge only keeps one level of `subactions`.
    for (const action of actions)
      for (const sub of action.subactions ?? [])
        expect(sub.subactions ?? []).toEqual([])

    expect(actions.map((a) => a.id)).toEqual(['group-0', 'dismiss', 'archive'])
    expect(actions[0].displayInline).toBe(true)
    expect(actions[1].subactions?.map((a) => a.id)).toEqual([
      'dismiss.1_week',
      'dismiss.1_month',
    ])
  })

  it('gives every SF Symbol a visible color on iOS', () => {
    const [group, dismiss, archive] = nativeMenuActions(
      menuGroups(contactMore),
      { ios: true, ...colors }
    )
    expect(group.subactions?.[0]).toMatchObject({
      image: 'square.and.arrow.up',
      imageColor: '#text',
    })
    expect(dismiss).toMatchObject({ image: 'clock', imageColor: '#text' })
    expect(archive).toMatchObject({
      image: 'archivebox',
      imageColor: '#err',
      attributes: { destructive: true },
    })
    // No symbol, no image (and no clear-tinted placeholder).
    expect(dismiss.subactions?.[0].image).toBeUndefined()
  })

  it('keeps inline groups when no group has a submenu', () => {
    const actions = nativeMenuActions(
      menuGroups([
        [{ id: 'a', title: 'A', onPress: noop }],
        [{ id: 'b', title: 'B', onPress: noop }],
      ]),
      { ios: true, ...colors }
    )
    expect(actions.map((a) => [a.id, a.displayInline])).toEqual([
      ['group-0', true],
      ['group-1', true],
    ])
  })

  it('concatenates groups with tinted drawable icons and top-level submenus on Android', () => {
    const actions = nativeMenuActions(menuGroups(contactMore), {
      ios: false,
      ...colors,
    })
    expect(actions.map((a) => a.id)).toEqual([
      'share',
      'edit',
      'dismiss',
      'archive',
    ])
    expect(actions[2].subactions).toHaveLength(2)
    expect(actions[0]).toMatchObject({
      image: 'ww_menu_share',
      imageColor: '#text',
    })
    expect(actions[2]).toMatchObject({
      image: 'ww_menu_clock',
      imageColor: '#text',
    })
    expect(actions[2].subactions?.[0].image).toBeUndefined()
    expect(actions[3]).toMatchObject({
      image: 'ww_menu_archive',
      imageColor: '#err',
    })
    expect(actions[3].titleColor).toBe('#err')
  })

  it('shows drawable icons for every avatar-menu action on Android', () => {
    const symbols = [
      'person.crop.circle',
      'gearshape',
      'heart',
      'questionmark.circle',
    ] as const
    const actions = nativeMenuActions(
      [
        symbols.map((systemImage) => ({
          id: systemImage,
          title: systemImage,
          systemImage,
          onPress: noop,
        })),
      ],
      { ios: false, ...colors }
    )
    expect(actions.map((action) => action.image)).toEqual([
      'ww_menu_profile',
      'ww_menu_settings',
      'ww_menu_heart',
      'ww_menu_help',
    ])
  })

  it('omits unsupported Android symbols, including in submenus', () => {
    const actions = nativeMenuActions(
      [
        [
          {
            id: 'more',
            title: 'More',
            systemImage: 'clock',
            actions: [
              {
                id: 'edit',
                title: 'Edit',
                systemImage: 'pencil',
                onPress: noop,
              },
              {
                id: 'custom',
                title: 'Custom',
                systemImage: 'ant',
                onPress: noop,
              },
            ],
          },
        ],
      ],
      { ios: false, ...colors }
    )
    expect(actions[0].subactions?.[0]).toMatchObject({
      image: 'ww_menu_edit',
      imageColor: '#text',
    })
    expect(actions[0].subactions?.[1].image).toBeUndefined()
  })
})
