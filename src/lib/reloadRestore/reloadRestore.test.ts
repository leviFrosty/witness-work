import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NavigationState } from '@react-navigation/native'

const disk = vi.hoisted(() => new Map<string, string>())

vi.mock('react-native-mmkv', () => ({
  MMKV: class {
    set = (key: string, value: string) => void disk.set(key, value)
    getString = (key: string) => disk.get(key)
    delete = (key: string) => void disk.delete(key)
    getAllKeys = () => [...disk.keys()]
  },
}))
vi.mock('@react-navigation/native', () => ({
  NavigationRouteContext: { _currentValue: undefined },
}))

import {
  rememberNavigation,
  resetReloadRestoreForTests,
  restoredNavigation,
} from '@/lib/reloadRestore/index.web'
import { decodeDraft, encodeDraft } from '@/lib/reloadRestore/draftJson'
import { normalizePath } from '@/lib/reloadRestore/navigationSnapshot'

const contactForm = {
  key: 'root-stack',
  index: 1,
  routeNames: ['Root', 'Contact Form'],
  type: 'stack',
  stale: false,
  routes: [
    {
      key: 'Root-1',
      name: 'Root',
      state: {
        key: 'tabs',
        index: 1,
        stale: false,
        type: 'tab',
        routeNames: ['Home', 'Contacts'],
        routes: [
          { key: 'Home-1', name: 'Home' },
          { key: 'Contacts-1', name: 'Contacts' },
        ],
      },
    },
    {
      key: 'Contact Form-1',
      name: 'Contact Form',
      params: { id: 'ae00', returnToContacts: true },
    },
  ],
} as unknown as NavigationState

const PATH = '/Contact%20Form?id=ae00&returnToContacts=true'

beforeEach(() => {
  disk.clear()
  resetReloadRestoreForTests()
})

describe('a reload', () => {
  it('comes back to the whole stack, keys and typed params included', () => {
    rememberNavigation(contactForm, PATH)
    resetReloadRestoreForTests()
    expect(restoredNavigation(PATH)).toEqual({
      index: 1,
      routes: [
        {
          key: 'Root-1',
          name: 'Root',
          state: {
            index: 1,
            routes: [
              { key: 'Home-1', name: 'Home' },
              { key: 'Contacts-1', name: 'Contacts' },
            ],
          },
        },
        {
          key: 'Contact Form-1',
          name: 'Contact Form',
          params: { id: 'ae00', returnToContacts: true },
        },
      ],
    })
  })

  it('matches the address however the browser spells it', () => {
    rememberNavigation(contactForm, PATH)
    resetReloadRestoreForTests()
    expect(
      restoredNavigation('/Contact Form?id=ae00&returnToContacts=true')
    ).toBeDefined()
  })

  it('opens a different address as that address', () => {
    rememberNavigation(contactForm, PATH)
    resetReloadRestoreForTests()
    expect(restoredNavigation('/map')).toBeUndefined()
  })

  it('restores only once, so later links parse as links', () => {
    rememberNavigation(contactForm, PATH)
    resetReloadRestoreForTests()
    expect(restoredNavigation(PATH)).toBeDefined()
    expect(restoredNavigation(PATH)).toBeUndefined()
  })

  it('keeps nothing while a screen holds a link secret, nested or not', () => {
    rememberNavigation(contactForm, PATH)
    const invite = {
      ...contactForm,
      routes: [
        ...contactForm.routes,
        {
          key: 'Buddy Invite-1',
          name: 'Buddy Invite',
          params: { link: 'SECRET' },
        },
      ],
    } as NavigationState
    rememberNavigation(invite, '/buddies/invite')
    expect(JSON.stringify([...disk.values()])).not.toContain('SECRET')
    resetReloadRestoreForTests()
    expect(restoredNavigation(PATH)).toBeUndefined()
  })

  it('forgets the drafts of screens that are gone', () => {
    disk.set('draft:["Contact Form-1","contact"]', '{"value":1}')
    disk.set('draft:["Contact Form-0","contact"]', '{"value":0}')
    rememberNavigation(contactForm, PATH)
    expect([...disk.keys()].filter((key) => key.startsWith('draft:'))).toEqual([
      'draft:["Contact Form-1","contact"]',
    ])
  })
})

describe('drafts', () => {
  it('keep dates as dates', () => {
    const date = new Date('2026-11-17T10:30:00.000Z')
    const draft = { note: 'Bring the brochure', date, nested: [{ date }] }
    expect(decodeDraft(encodeDraft(draft))).toEqual({ value: draft })
  })

  it('read nothing from a damaged draft', () => {
    expect(decodeDraft('{')).toBeUndefined()
    expect(decodeDraft('null')).toBeUndefined()
  })
})

describe('normalizePath', () => {
  it('spells spaces and percent escapes alike', () => {
    expect(normalizePath('/Contact%20Form?id=1')).toBe(
      normalizePath('/Contact Form?id=1')
    )
  })
})
