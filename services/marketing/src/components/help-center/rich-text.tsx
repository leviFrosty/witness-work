import type { ReactNode } from 'react'
import { SITE_ORIGIN } from '@/lib/site'
import { cn } from '@/lib/utils'
import type {
  RichTextBlock,
  RichTextDoc,
  RichTextInline,
} from '@/lib/help-center/types'

/**
 * Renders an answer from the same rich text document the app renders, so the
 * site and the app can't drift apart. `lg` is for an answer on its own page.
 */
export function RichText({
  doc,
  size = 'base',
}: {
  doc: RichTextDoc
  size?: 'base' | 'lg'
}) {
  return (
    <div
      className={cn(
        'ww-rich flex flex-col gap-4 leading-relaxed',
        size === 'lg' ? 'text-[1.0625rem] sm:text-lg' : 'text-base'
      )}
    >
      {doc.content.map((block, index) => (
        <Block key={index} block={block} />
      ))}
    </div>
  )
}

function Inline({ content }: { content?: RichTextInline[] }) {
  return (
    <>
      {(content ?? []).map((node, index) => {
        if (node.type === 'hardBreak') return <br key={index} />
        let out: ReactNode = node.text
        for (const mark of node.marks ?? []) {
          if (mark.type === 'bold') {
            out = <strong>{out}</strong>
          } else if (mark.type === 'italic') {
            out = <em>{out}</em>
          } else if (mark.type === 'strike') {
            out = <s>{out}</s>
          } else {
            const external = !mark.attrs.href.startsWith(`${SITE_ORIGIN}/`)
            out = (
              <a
                href={mark.attrs.href}
                className='ww-link'
                {...(external
                  ? { target: '_blank', rel: 'noopener noreferrer' }
                  : {})}
              >
                {out}
              </a>
            )
          }
        }
        return <span key={index}>{out}</span>
      })}
    </>
  )
}

function Block({ block }: { block: RichTextBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <Inline content={block.content} />
        </p>
      )
    case 'heading':
      return block.attrs.level === 1 ? (
        <h2 className='mt-3 text-[1.35em] font-semibold tracking-tight'>
          <Inline content={block.content} />
        </h2>
      ) : (
        <h3 className='mt-2 text-[1.1em] font-semibold tracking-tight'>
          <Inline content={block.content} />
        </h3>
      )
    case 'bulletList':
      return (
        <ul className='flex list-disc flex-col gap-2 ps-5'>
          {block.content.map((item, index) => (
            <li key={index} className='[&>*+*]:mt-2'>
              {item.content.map((child, i) => (
                <Block key={i} block={child} />
              ))}
            </li>
          ))}
        </ul>
      )
    case 'orderedList':
      return (
        <ol
          start={block.attrs?.start}
          className='flex list-decimal flex-col gap-2 ps-5'
        >
          {block.content.map((item, index) => (
            <li key={index} className='[&>*+*]:mt-2'>
              {item.content.map((child, i) => (
                <Block key={i} block={child} />
              ))}
            </li>
          ))}
        </ol>
      )
  }
}
