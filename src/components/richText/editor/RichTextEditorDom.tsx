'use dom'

import { useEffect, useLayoutEffect, useRef, useState, type Ref } from 'react'
import {
  useDOMImperativeHandle,
  type DOMImperativeFactory,
  type DOMProps,
} from 'expo/dom'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import Image from '@tiptap/extension-image'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import type { NodeViewRenderer } from '@tiptap/core'
import type {
  EditorCommand,
  EditorFormatState,
  EditorSetup,
} from '@/components/richText/editor/editorProtocol'
import { normalizeImageScale, snapImageScale } from '@/lib/richText/imageScale'

/*
 * The note editor's web half: Tiptap in the WebView, driven by the native
 * toolbar through `run`, reporting the doc and the formatting at the cursor
 * back. It imports nothing from React Native or the app's UI kit, because it
 * runs in a browser.
 */

/** A JSON value that crosses the bridge (expo/dom doesn't export its type). */
export type BridgeValue = Parameters<DOMImperativeFactory[string]>[number]

export type RichTextEditorHandle = DOMImperativeFactory & {
  /** Takes an `EditorCommand`; typed loosely because it crosses the bridge. */
  run: (command: BridgeValue) => void
}

type Props = {
  ref?: Ref<RichTextEditorHandle>
  dom?: DOMProps
  getSetup: () => Promise<EditorSetup>
  onReady: () => Promise<void>
  onChange: (doc: Record<string, unknown>) => Promise<void>
  onFormatState: (state: EditorFormatState) => Promise<void>
  /** Where the selected photo's resize handles are: `[x, y, width, height]`. */
  onImageHandles: (rects: number[][]) => Promise<void>
}

const CHANGE_DEBOUNCE_MS = 300
const SELECTION_PREFILL_CHARS = 200

/** Image id → URL; filled from the setup and as photos are inserted. */
const imageSources = new Map<string, string>()
const imageElements = new Map<string, Set<HTMLImageElement>>()

/** How tall a photo that hasn't been resized can be, as the app shows it. */
const DEFAULT_IMAGE_MAX_HEIGHT = 360
const CORNERS = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

/** What a photo's share of the note is a share of: its parent's content box. */
function contentWidth(element: HTMLElement | null): number {
  if (!element) return 0
  const style = getComputedStyle(element)
  return (
    element.clientWidth -
    parseFloat(style.paddingLeft) -
    parseFloat(style.paddingRight)
  )
}

/** A photo's width: its share once resized, else the app's default size. */
function imageWidth(attrs: Record<string, unknown>): string {
  const scale = normalizeImageScale(attrs.scale)
  if (scale) return `${scale * 100}%`
  const ratio = Number(attrs.width) / Number(attrs.height)
  return ratio < 1
    ? `min(100%, ${Math.round(DEFAULT_IMAGE_MAX_HEIGHT * ratio)}px)`
    : '100%'
}

/**
 * The selected photo's resize handles, reported to the native side so Android
 * keeps its back gesture off them near the screen's edges.
 */
const handles = {
  frame: null as HTMLElement | null,
  report: (_rects: number[][]) => {},
  sent: '',
  pending: 0,
}

function reportHandles() {
  if (handles.pending) return
  handles.pending = requestAnimationFrame(() => {
    handles.pending = 0
    const rects = handles.frame
      ? Array.from(
          handles.frame.querySelectorAll('.note-image-handle'),
          (handle) => {
            const box = handle.getBoundingClientRect()
            return [box.left, box.top, box.width, box.height].map(Math.round)
          }
        )
      : []
    const key = JSON.stringify(rects)
    if (key === handles.sent) return
    handles.sent = key
    handles.report(rects)
  })
}

/**
 * A photo in the editor. Tapping it selects it and shows a handle at each
 * corner; dragging one resizes the photo around its center, keeping its
 * proportions, and saves its new share of the note's width when let go.
 */
const imageView: NodeViewRenderer = ({ node, getPos, editor }) => {
  let current = node
  const id = String(node.attrs.id)
  const frame = document.createElement('div')
  frame.className = 'note-image'
  frame.style.width = imageWidth(node.attrs)
  const img = document.createElement('img')
  img.setAttribute('data-note-image', id)
  img.style.aspectRatio = `${node.attrs.width} / ${node.attrs.height}`
  img.src = imageSources.get(id) ?? ''
  img.draggable = false
  frame.append(img)
  const set = imageElements.get(id) ?? new Set()
  set.add(img)
  imageElements.set(id, set)

  const commit = (scale: number) => {
    const pos = getPos()
    if (typeof pos !== 'number' || current.attrs.scale === scale) {
      frame.style.width = imageWidth(current.attrs)
      return
    }
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeMarkup(pos, undefined, { ...current.attrs, scale })
        return true
      })
      .setNodeSelection(pos)
      .run()
  }

  const startResize = (
    event: PointerEvent,
    handle: HTMLElement,
    side: 1 | -1
  ) => {
    const available = contentWidth(frame.parentElement)
    if (!editor.isEditable || !event.isPrimary || !available) return
    event.preventDefault()
    handle.setPointerCapture(event.pointerId)
    const startWidth = frame.getBoundingClientRect().width
    const startX = event.clientX
    let scale: number | null = null
    frame.classList.add('resizing')
    const move = (moved: PointerEvent) => {
      // Centered, so both sides move by the drag: the corner stays under the
      // finger.
      const width = startWidth + 2 * side * (moved.clientX - startX)
      scale = snapImageScale(width / available)
      frame.style.width = `${scale * 100}%`
    }
    const end = () => {
      handle.removeEventListener('pointermove', move)
      handle.removeEventListener('pointerup', end)
      handle.removeEventListener('pointercancel', end)
      frame.classList.remove('resizing')
      // A tap on a handle isn't a resize.
      if (scale !== null) commit(scale)
      reportHandles()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', end)
    handle.addEventListener('pointercancel', end)
  }

  for (const corner of CORNERS) {
    const handle = document.createElement('div')
    handle.className = `note-image-handle ${corner}`
    handle.setAttribute('aria-hidden', 'true')
    const side = corner.endsWith('right') ? 1 : -1
    handle.addEventListener('pointerdown', (event) =>
      startResize(event, handle, side)
    )
    frame.append(handle)
  }

  return {
    dom: frame,
    update: (next) => {
      if (next.type !== current.type || next.attrs.id !== current.attrs.id) {
        return false
      }
      current = next
      frame.style.width = imageWidth(next.attrs)
      return true
    },
    // Only the class: the default would also make the photo draggable, which
    // a resize drag would start.
    selectNode: () => {
      frame.classList.add('ProseMirror-selectednode')
      handles.frame = frame
      reportHandles()
    },
    deselectNode: () => {
      frame.classList.remove('ProseMirror-selectednode')
      if (handles.frame === frame) handles.frame = null
      reportHandles()
    },
    stopEvent: (event) =>
      event.target instanceof Element &&
      event.target.closest('.note-image-handle') !== null,
    destroy: () => {
      imageElements.get(id)?.delete(img)
      if (handles.frame === frame) handles.frame = null
      reportHandles()
    },
  }
}

const NoteImage = Image.extend({
  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('data-note-image'),
      },
      width: { default: null },
      height: { default: null },
      scale: {
        default: null,
        parseHTML: (element) =>
          normalizeImageScale(Number(element.getAttribute('data-scale'))) ??
          null,
      },
    }
  },
  // Only our own photos: pasted web images (remote URLs, base64) are dropped.
  parseHTML() {
    return [{ tag: 'img[data-note-image]' }]
  },
  renderHTML({ node }) {
    return [
      'img',
      {
        'data-note-image': node.attrs.id,
        ...(node.attrs.scale ? { 'data-scale': String(node.attrs.scale) } : {}),
        src: imageSources.get(node.attrs.id) ?? '',
        width: node.attrs.width,
        height: node.attrs.height,
      },
    ]
  },
  addNodeView() {
    return imageView
  },
}).configure({ inline: false, allowBase64: false })

function setImageSource(id: string, src: string) {
  imageSources.set(id, src)
  for (const img of imageElements.get(id) ?? []) img.src = src
}

function formatState(editor: Editor): EditorFormatState {
  const { from, to, empty } = editor.state.selection
  let images = 0
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'image') images++
  })
  const can = editor.can()
  return {
    focused: editor.isFocused,
    bold: editor.isActive('bold'),
    italic: editor.isActive('italic'),
    underline: editor.isActive('underline'),
    strike: editor.isActive('strike'),
    block: editor.isActive('heading', { level: 1 })
      ? 'heading1'
      : editor.isActive('heading', { level: 2 })
        ? 'heading2'
        : 'paragraph',
    list: editor.isActive('taskList')
      ? 'taskList'
      : editor.isActive('orderedList')
        ? 'orderedList'
        : editor.isActive('bulletList')
          ? 'bulletList'
          : null,
    link: (editor.getAttributes('link').href as string | undefined) ?? null,
    selection: empty
      ? ''
      : editor.state.doc
          .textBetween(from, to, ' ')
          .slice(0, SELECTION_PREFILL_CHARS),
    canIndent: can.sinkListItem('listItem') || can.sinkListItem('taskItem'),
    canOutdent: can.liftListItem('listItem') || can.liftListItem('taskItem'),
    canUndo: can.undo(),
    canRedo: can.redo(),
    images,
  }
}

function runCommand(editor: Editor, command: EditorCommand) {
  const chain = () => editor.chain().focus()
  switch (command.type) {
    case 'focus':
      editor.commands.focus(command.at ?? null)
      return
    case 'blur':
      editor.commands.blur()
      return
    case 'flush':
      return
    case 'toggleMark':
      chain().toggleMark(command.mark).run()
      return
    case 'setBlock':
      if (command.block === 'paragraph') chain().setParagraph().run()
      else {
        chain()
          .toggleHeading({ level: command.block === 'heading1' ? 1 : 2 })
          .run()
      }
      return
    case 'toggleList':
      if (command.list === 'bulletList') chain().toggleBulletList().run()
      else if (command.list === 'orderedList') chain().toggleOrderedList().run()
      else chain().toggleTaskList().run()
      return
    case 'indent':
      if (!chain().sinkListItem('listItem').run()) {
        chain().sinkListItem('taskItem').run()
      }
      return
    case 'outdent':
      if (!chain().liftListItem('listItem').run()) {
        chain().liftListItem('taskItem').run()
      }
      return
    case 'setLink': {
      const { href, text } = command
      if (editor.isActive('link')) {
        chain().extendMarkRange('link').setLink({ href }).run()
      } else if (editor.state.selection.empty) {
        const label = text?.trim() || href
        chain()
          .insertContent({
            type: 'text',
            text: label,
            marks: [{ type: 'link', attrs: { href } }],
          })
          .unsetMark('link')
          .insertContent(' ')
          .run()
      } else {
        chain().setLink({ href }).run()
      }
      return
    }
    case 'unsetLink':
      chain().extendMarkRange('link').unsetLink().run()
      return
    case 'insertImage':
      setImageSource(command.image.id, command.src)
      chain()
        .insertContent([
          { type: 'image', attrs: command.image },
          { type: 'paragraph' },
        ])
        .run()
      return
    case 'undo':
      chain().undo().run()
      return
    case 'redo':
      chain().redo().run()
      return
  }
}

function fontFaces(setup: EditorSetup): string {
  const faces: [string | undefined, number, string][] = [
    [setup.fonts.regular, 400, 'normal'],
    [setup.fonts.bold, 700, 'normal'],
    [setup.fonts.italic, 400, 'italic'],
    [setup.fonts.boldItalic, 700, 'italic'],
  ]
  return faces
    .filter(([src]) => src)
    .map(
      ([src, weight, style]) =>
        `@font-face{font-family:NoteInter;src:url("${src}");font-weight:${weight};font-style:${style};}`
    )
    .join('')
}

function styles(setup: EditorSetup): string {
  const t = setup.theme
  return `${fontFaces(setup)}
:root{color-scheme:${t.scheme};}
html,body{margin:0;padding:0;min-height:100%;overflow-x:hidden;background:${t.background};-webkit-text-size-adjust:100%;}
body{color:${t.text};font-family:NoteInter,-apple-system,system-ui,Roboto,sans-serif;font-size:${t.fontSize}px;line-height:1.45;-webkit-tap-highlight-color:transparent;}
.ProseMirror{outline:none;box-sizing:border-box;min-height:100vh;padding:12px 16px 96px;caret-color:${t.accent};white-space:pre-wrap;word-wrap:break-word;-webkit-user-select:text;user-select:text;}
.ProseMirror p{margin:0 0 6px;}
.ProseMirror h1{font-size:1.43em;font-weight:700;line-height:1.25;margin:4px 0 6px;}
.ProseMirror h2{font-size:1.15em;font-weight:700;line-height:1.3;margin:4px 0 6px;}
.ProseMirror ul,.ProseMirror ol{margin:0 0 6px;padding-left:24px;}
.ProseMirror li>p{margin:0 0 4px;}
.ProseMirror ul[data-type=taskList]{list-style:none;padding-left:2px;}
.ProseMirror ul[data-type=taskList] li{display:flex;gap:8px;align-items:flex-start;}
.ProseMirror ul[data-type=taskList] li>label{flex:0 0 auto;margin-top:1px;}
.ProseMirror ul[data-type=taskList] li>div{flex:1 1 auto;min-width:0;}
.ProseMirror ul[data-type=taskList] li[data-checked=true]>div{color:${t.textAlt};text-decoration:line-through;}
.ProseMirror input[type=checkbox]{accent-color:${t.accent};width:18px;height:18px;margin:0;}
.ProseMirror a{color:${t.accent};text-decoration:underline;}
.note-image{position:relative;max-width:100%;margin:6px auto;}
.note-image img{display:block;width:100%;height:auto;border-radius:10px;background:${t.border};}
.note-image.ProseMirror-selectednode img{outline:3px solid ${t.accent};}
.note-image.resizing img{opacity:.85;}
.note-image-handle{display:none;position:absolute;z-index:1;width:44px;height:44px;touch-action:none;-webkit-touch-callout:none;-webkit-user-select:none;user-select:none;}
.note-image.ProseMirror-selectednode .note-image-handle{display:block;}
.note-image-handle::after{content:"";position:absolute;left:13px;top:13px;width:18px;height:18px;box-sizing:border-box;border-radius:50%;background:${t.accent};border:3px solid ${t.background};box-shadow:0 1px 3px rgba(0,0,0,.35);}
.note-image-handle.top-left{left:-22px;top:-22px;cursor:nwse-resize;}
.note-image-handle.top-right{right:-22px;top:-22px;cursor:nesw-resize;}
.note-image-handle.bottom-left{left:-22px;bottom:-22px;cursor:nesw-resize;}
.note-image-handle.bottom-right{right:-22px;bottom:-22px;cursor:nwse-resize;}
.ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:${t.textAlt};float:left;height:0;pointer-events:none;}`
}

/**
 * A call to the native side. One still pending when the screen closes fails
 * (iOS has removed the page's message handler); the doc was handed over on
 * flush, so there's nothing left to do.
 */
const send = (call: Promise<void>) => {
  call.catch(() => {})
}

const sameState = (a: EditorFormatState | null, b: EditorFormatState) =>
  !!a && JSON.stringify(a) === JSON.stringify(b)

export default function RichTextEditorDom(props: Props) {
  // Bridged native functions are new objects every time native sends props,
  // so effects read them from here instead of depending on them.
  const bridge = useRef(props)
  useLayoutEffect(() => {
    bridge.current = props
  })
  const [setup, setSetup] = useState<EditorSetup | null>(null)
  const changeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastState = useRef<EditorFormatState | null>(null)
  const stateFrame = useRef<number | null>(null)

  useEffect(() => {
    let active = true
    void bridge.current.getSetup().then((value) => {
      if (!active) return
      for (const [id, src] of Object.entries(value.imageSources)) {
        imageSources.set(id, src)
      }
      setSetup(value)
    })
    return () => {
      active = false
    }
  }, [])

  const editor = useEditor(
    {
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: setup?.autofocus ? 'end' : false,
      content: setup?.doc ?? null,
      editable: !!setup,
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2] },
          code: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
          link: {
            openOnClick: false,
            autolink: true,
            linkOnPaste: true,
            defaultProtocol: 'https',
            HTMLAttributes: { target: null, rel: null },
            shouldAutoLink: (value) => /^(?:https?:\/\/|www\.)/i.test(value),
          },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        NoteImage,
        Placeholder.configure({ placeholder: setup?.placeholder ?? '' }),
        CharacterCount.configure({ limit: setup?.characterLimit ?? null }),
      ],
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': setup?.label ?? '',
          autocapitalize: 'sentences',
          spellcheck: 'true',
        },
      },
      onCreate: () => {
        if (setup) send(bridge.current.onReady())
      },
      onUpdate: ({ editor: current }) => {
        if (changeTimer.current) clearTimeout(changeTimer.current)
        changeTimer.current = setTimeout(() => {
          changeTimer.current = null
          send(bridge.current.onChange(current.getJSON()))
        }, CHANGE_DEBOUNCE_MS)
      },
      onTransaction: ({ editor: current }) => {
        if (handles.frame) reportHandles()
        if (stateFrame.current !== null) return
        stateFrame.current = requestAnimationFrame(() => {
          stateFrame.current = null
          const next = formatState(current)
          if (sameState(lastState.current, next)) return
          lastState.current = next
          send(bridge.current.onFormatState(next))
        })
      },
      onBlur: ({ editor: current }) => {
        // Hand the latest doc over now: the screen may close next.
        if (changeTimer.current) {
          clearTimeout(changeTimer.current)
          changeTimer.current = null
          send(bridge.current.onChange(current.getJSON()))
        }
      },
    },
    [setup]
  )

  // A tap below the note (it's often short) still starts writing, at the end.
  useEffect(() => {
    if (!editor) return
    const focusEnd = (event: MouseEvent) => {
      if (editor.view.dom.contains(event.target as Node)) return
      event.preventDefault()
      editor.commands.focus('end')
    }
    document.addEventListener('click', focusEnd)
    return () => document.removeEventListener('click', focusEnd)
  }, [editor])

  // The selected photo's handles move when the note scrolls or reflows.
  useEffect(() => {
    handles.report = (rects) => send(bridge.current.onImageHandles(rects))
    const moved = () => {
      if (handles.frame) reportHandles()
    }
    window.addEventListener('scroll', moved, { passive: true })
    window.addEventListener('resize', moved)
    return () => {
      window.removeEventListener('scroll', moved)
      window.removeEventListener('resize', moved)
    }
  }, [])

  // A smaller viewport (the keyboard came up) can hide the caret.
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport || !editor) return
    const keepCaretVisible = () => {
      if (editor.isFocused) editor.commands.scrollIntoView()
    }
    viewport.addEventListener('resize', keepCaretVisible)
    return () => viewport.removeEventListener('resize', keepCaretVisible)
  }, [editor])

  useDOMImperativeHandle(
    props.ref as Ref<RichTextEditorHandle>,
    () => ({
      run: (command) => {
        if (!editor) return
        const typed = command as unknown as EditorCommand
        if (typed.type === 'flush') {
          if (changeTimer.current) clearTimeout(changeTimer.current)
          changeTimer.current = null
          send(bridge.current.onChange(editor.getJSON()))
          return
        }
        runCommand(editor, typed)
      },
    }),
    [editor]
  )

  if (!setup) return null

  return (
    <>
      <style>{styles(setup)}</style>
      <EditorContent editor={editor} />
    </>
  )
}
