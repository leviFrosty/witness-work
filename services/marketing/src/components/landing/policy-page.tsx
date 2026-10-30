import type { ReactNode } from 'react'
import { PageMeta } from './page-meta'
import { WitnessWorkPage } from './page-shell'

/**
 * WitnessWork's Privacy Policy and Terms of Use (English only), laid out like
 * Apple's legal pages: a short title block, then one plain section after
 * another.
 */
export function PolicyPage({
  path,
  eyebrow,
  title,
  description,
  updated,
  sections,
  children,
}: {
  path: string
  eyebrow: string
  title: string
  description: string
  updated: string
  sections: { title: string; body: ReactNode }[]
  /** Closing lines after the last section. */
  children?: ReactNode
}) {
  return (
    <WitnessWorkPage locale='en-US'>
      <PageMeta
        title={`${title} · WitnessWork`}
        description={description}
        path={path}
      />
      <main id='main' className='ww-policy'>
        <article className='mx-auto w-full max-w-[760px] px-5 sm:px-8'>
          <header className='ww-policy-head'>
            <p className='ww-eyebrow'>{eyebrow}</p>
            <h1 className='ww-display ww-policy-title'>{title}</h1>
            <p className='ww-lead'>{description}</p>
            <p className='ww-foot'>{updated}</p>
          </header>
          <div className='ww-policy-sections'>
            {sections.map((section) => (
              <section key={section.title}>
                <h2>{section.title}</h2>
                <div className='ww-body'>{section.body}</div>
              </section>
            ))}
          </div>
          {children && <div className='ww-policy-end ww-body'>{children}</div>}
        </article>
      </main>
    </WitnessWorkPage>
  )
}
