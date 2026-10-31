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
import { Extension, type NodeViewRenderer } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import {
  NOTE_GUTTER,
  NOTE_MAX_WIDTH,
  type EditorCommand,
  type EditorFormatState,
  type EditorSetup,
} from '@/components/richText/editor/editorProtocol'
import { normalizeImageScale, snapImageScale } from '@/lib/richText/imageScale'
import { textDirection } from '@/lib/textDirection'

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
/** The note before native sends it: one empty paragraph, as JSON. */
const EMPTY_DOC = { type: 'doc', content: [{ type: 'paragraph' }] }
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

const DIRECTED_NODES = new Set(['paragraph', 'heading', 'listItem', 'taskItem'])

/**
 * Decorates `node`'s paragraphs, headings and list items with their direction
 * and returns `node`'s own. A text block's comes from its text; any other
 * node's from its first child that has one. That's the first letter of its
 * `textContent` (what `RichTextView` reads for a list item), without reading a
 * nested list's text again at every level.
 */
function collectDirections(
  node: ProseMirrorNode,
  contentStart: number,
  decorations: Decoration[]
): 'ltr' | 'rtl' | undefined {
  if (node.isTextblock) return textDirection(node.textContent)
  let first: 'ltr' | 'rtl' | undefined
  node.forEach((child, offset) => {
    const pos = contentStart + offset
    const dir = collectDirections(child, pos + 1, decorations)
    if (dir && DIRECTED_NODES.has(child.type.name)) {
      decorations.push(Decoration.node(pos, pos + child.nodeSize, { dir }))
    }
    first ??= dir
  })
  return first
}

function textDirections(doc: ProseMirrorNode): DecorationSet {
  const decorations: Decoration[] = []
  collectDirections(doc, 0, decorations)
  return DecorationSet.create(doc, decorations)
}

const textDirectionsKey = new PluginKey<DecorationSet>('noteTextDirections')

/**
 * Gives each paragraph, heading and list item the direction of its first letter
 * (`textDirection`, as `RichTextView` does), so an English line in an Arabic
 * note keeps its own side, list marker included. Lines without letters (an
 * empty line being typed) follow the app's direction from the root. Only
 * decorations: nothing is stored in the note. Worked out again only when the
 * text changes, not as the caret or selection moves.
 */
const TextDirections = Extension.create({
  name: 'noteTextDirections',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: textDirectionsKey,
        state: {
          init: (_, state) => textDirections(state.doc),
          apply: (tr, directions) =>
            tr.docChanged ? textDirections(tr.doc) : directions,
        },
        props: {
          decorations: (state) => textDirectionsKey.getState(state),
        },
      }),
    ]
  },
})

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
          .insertContent({ type: 'text', text: ' ' })
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
/* expo/dom's #root is a flex row, which shrinks the note to its widest line; as a column the note fills the width, so right-aligned text and lists sit at the edge and a resized photo's share is of the whole width, as when the note is shown. */
#root{flex-direction:column;}
/* Tiptap's own base rules. It doesn't write them itself (\`injectCSS: false\`): the web's CSP refuses a \`<style>\` filled through \`innerHTML\` (ADR 0037 §5). They come before the note's, as Tiptap's did. */
.ProseMirror{position:relative;word-wrap:break-word;white-space:pre-wrap;white-space:break-spaces;-webkit-font-variant-ligatures:none;font-variant-ligatures:none;font-feature-settings:"liga" 0;}
.ProseMirror [contenteditable="false"]{white-space:normal;}
.ProseMirror [contenteditable="false"] [contenteditable="true"]{white-space:pre-wrap;}
img.ProseMirror-separator{display:inline !important;border:none !important;margin:0 !important;width:0 !important;height:0 !important;}
.ProseMirror-gapcursor{display:none;pointer-events:none;position:absolute;margin:0;}
.ProseMirror-gapcursor:after{content:"";display:block;position:absolute;top:-2px;width:20px;border-top:1px solid black;animation:ProseMirror-cursor-blink 1.1s steps(2,start) infinite;}
@keyframes ProseMirror-cursor-blink{to{visibility:hidden;}}
.ProseMirror-hideselection *::selection{background:transparent;}
.ProseMirror-hideselection *{caret-color:transparent;}
.ProseMirror-focused .ProseMirror-gapcursor{display:block;}
html,body{margin:0;padding:0;min-height:100%;overflow-x:hidden;background:${t.background};-webkit-text-size-adjust:100%;}
body{color:${t.text};font-family:NoteInter,-apple-system,system-ui,Roboto,sans-serif;font-size:${t.fontSize}px;line-height:1.45;-webkit-tap-highlight-color:transparent;}
/* On a wide screen the side padding grows so the text keeps to a ${NOTE_MAX_WIDTH}px column, while a tap beside it still reaches the note. A photo's share is of that column. */
.ProseMirror{outline:none;box-sizing:border-box;min-height:100vh;padding:12px max(${NOTE_GUTTER}px,calc((100% - ${NOTE_MAX_WIDTH}px) / 2 + ${NOTE_GUTTER}px)) 96px;caret-color:${t.accent};white-space:pre-wrap;word-wrap:break-word;-webkit-user-select:text;user-select:text;}
.ProseMirror p{margin:0 0 6px;}
.ProseMirror h1{font-size:1.43em;font-weight:700;line-height:1.25;margin:4px 0 6px;}
.ProseMirror h2{font-size:1.15em;font-weight:700;line-height:1.3;margin:4px 0 6px;}
.ProseMirror p,.ProseMirror h1,.ProseMirror h2{text-align:start;}
.ProseMirror ul,.ProseMirror ol{margin:0 0 6px;padding:0;}
.ProseMirror li{margin-inline-start:24px;}
.ProseMirror li>p{margin:0 0 4px;}
.ProseMirror ul[data-type=taskList]{list-style:none;}
.ProseMirror ul[data-type=taskList]>li{margin-inline-start:2px;}
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
.ProseMirror p.is-editor-empty:first-child::before{content:attr(data-placeholder);color:${t.textAlt};float:${setup.direction === 'rtl' ? 'right' : 'left'};height:0;pointer-events:none;}`
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
      // Content is always JSON: Tiptap parses a string, even an empty one, as
      // HTML through \`DOMParser\`, which the web's Trusted Types refuse.
      content: setup?.doc ?? EMPTY_DOC,
      injectCSS: false,
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
        TextDirections,
        CharacterCount.configure({ limit: setup?.characterLimit ?? null }),
      ],
      editorProps: {
        attributes: {
          role: 'textbox',
          'aria-multiline': 'true',
          'aria-label': setup?.label ?? '',
          // Lines without letters follow the app; the rest take their own
          // direction (`TextDirections`).
          dir: setup?.direction ?? 'ltr',
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
