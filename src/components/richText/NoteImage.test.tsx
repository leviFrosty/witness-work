import { act, create } from 'react-test-renderer'
import { describe, expect, it, vi } from 'vitest'

const runtime = vi.hoisted(() => ({ uri: '' }))
vi.mock('react-native', () => ({ View: 'View' }))
vi.mock('expo-image', () => ({ Image: 'Image' }))
vi.mock('lucide-react-native', () => ({ ImageOff: 'ImageOff' }))
vi.mock('@/components/ui/Button', () => ({ default: 'Button' }))
vi.mock('@/components/ui/MyText', () => ({ default: 'Text' }))
vi.mock('@/components/PhotoNotSyncedBadge', () => ({ default: 'Badge' }))
vi.mock('@/contexts/theme', () => ({
  default: () => ({
    colors: {},
    numbers: {},
    fontSize: () => 12,
  }),
}))
vi.mock('@/lib/locales', () => ({ default: { t: (key: string) => key } }))
vi.mock('@/lib/richText/noteImageRevision', () => ({
  useNoteImageUri: () => runtime.uri,
}))

import { Image } from 'expo-image'
import NoteImage from '@/components/richText/NoteImage'
import Text from '@/components/ui/MyText'

const image = { id: 'photo-0001', width: 400, height: 300 }
const render = () => {
  let renderer!: ReturnType<typeof create>
  act(() => {
    renderer = create(<NoteImage image={image} />)
  })
  return renderer
}

describe('NoteImage', () => {
  it('shows the missing-photo placeholder where this page has no such photo (the web: no uri)', () => {
    runtime.uri = ''
    const tree = render()
    expect(tree.root.findAllByType(Image)).toHaveLength(0)
    expect(
      tree.root
        .findAllByType(Text)
        .map((text) => text.props.children)
        .includes('richText_photoMissing')
    ).toBe(true)
  })

  it('shows the photo when there is a uri', () => {
    runtime.uri = 'file:///Docs/note-images/photo-0001.jpg'
    const tree = render()
    expect(tree.root.findAllByType(Image)).toHaveLength(1)
  })

  it('falls back to the placeholder when the photo fails to load', () => {
    runtime.uri = 'file:///Docs/note-images/photo-0001.jpg'
    const tree = render()
    act(() => tree.root.findByType(Image).props.onError())
    expect(tree.root.findAllByType(Image)).toHaveLength(0)
  })
})
