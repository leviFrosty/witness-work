import enUS from './i18n/en-US'
import { WitnessWorkPage } from './page-shell'

/** The 404 page (public/404.html after the build), in English. */
export function NotFoundPage() {
  return (
    <WitnessWorkPage locale='en-US'>
      <title>Page not found · WitnessWork</title>
      <meta name='robots' content='noindex' />
      <main id='main' className='ww-policy' data-not-found=''>
        <article className='mx-auto flex w-full max-w-[760px] flex-col items-start gap-6 px-5 sm:px-8'>
          <header className='ww-policy-head'>
            <p className='ww-eyebrow'>404</p>
            <h1 className='ww-display ww-policy-title'>Page not found</h1>
            <p className='ww-lead'>This page doesn't exist, or it has moved.</p>
          </header>
          <div className='flex flex-wrap gap-3'>
            <a href='/' className='ww-btn ww-btn-primary'>
              WitnessWork
            </a>
            <a href='/help' className='ww-btn ww-btn-ghost'>
              {enUS.nav.help}
            </a>
          </div>
        </article>
      </main>
    </WitnessWorkPage>
  )
}
