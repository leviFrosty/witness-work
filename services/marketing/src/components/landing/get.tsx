import enUS from '@/components/landing/i18n/en-US'
import { StoreBadges } from '@/components/landing/ui'
import { GET_PATH } from '@/lib/paths'
import { SITE } from '@/lib/site'
import { PageMeta } from './page-meta'

export default function GetWitnessWork() {
  return (
    <div
      data-page='ww'
      className='grid min-h-screen place-items-center px-6 py-16 text-center'
    >
      <PageMeta
        title='Get WitnessWork'
        description={enUS.cta.body}
        path={GET_PATH}
      />
      {}
      {SITE.indexable && <meta name='robots' content='noindex' />}
      <script src='/get.js' />
      <div className='flex max-w-md flex-col items-center gap-6'>
        <img
          src='/images/icon.png'
          alt=''
          width={96}
          height={96}
          className='size-24 rounded-[26px]'
        />
        <h1 className='ww-h2 text-[2.6rem]'>WitnessWork</h1>
        <p className='ww-lead'>{enUS.cta.body}</p>
        <StoreBadges locale='en-US' labels={enUS.store} size='lg' />
        <a href='/' className='text-sm text-[var(--ww-mint)] hover:underline'>
          witnesswork.app
        </a>
      </div>
    </div>
  )
}
