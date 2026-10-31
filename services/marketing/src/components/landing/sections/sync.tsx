import { Check, LockKeyhole } from 'lucide-react'
import type { LandingMessages } from '../i18n'
import { Reveal, SectionHeading } from '../ui'

type Node = {
  id: string
  kind: 'watch' | 'phone' | 'tablet' | 'fold' | 'android'
  name: string
}

/** The month as each device shows it: before and after the watch adds 2 hrs. */
function MiniApp({ t, kind }: { t: LandingMessages; kind: Node['kind'] }) {
  const demo = t.sync.demo
  return (
    <div className='ww-mini' data-kind={kind}>
      {kind === 'tablet' && <div className='ww-mini-sidebar' aria-hidden />}
      <div className='ww-mini-main'>
        <span className='ww-mini-label'>{demo.month}</span>
        <span className='ww-mini-hours'>
          <span className='ww-mini-old'>{demo.before}</span>
          <span className='ww-mini-new'>{demo.after}</span>
        </span>
        <span className='ww-mini-bar'>
          <span />
        </span>
        {kind !== 'watch' && (
          <span className='ww-mini-rows' aria-hidden>
            <i />
            <i />
            <i />
          </span>
        )}
      </div>
      {kind === 'fold' && (
        <div className='ww-mini-main ww-mini-second' aria-hidden>
          <span className='ww-mini-rows'>
            <i />
            <i />
            <i />
            <i />
          </span>
        </div>
      )}
      <span className='ww-mini-synced' aria-hidden>
        <Check className='size-full' strokeWidth={3.2} />
      </span>
    </div>
  )
}

function Device({ node, t }: { node: Node; t: LandingMessages }) {
  return (
    <div className='ww-node' data-node={node.id} data-kind={node.kind}>
      <div className='ww-node-device'>
        {node.kind === 'watch' && (
          <>
            <span className='ww-node-band ww-node-band-top' />
            <span className='ww-node-band ww-node-band-bottom' />
          </>
        )}
        <div className='ww-node-glass'>
          <MiniApp t={t} kind={node.kind} />
        </div>
        {node.kind === 'fold' && <span className='ww-node-hinge' />}
      </div>
      <span className='ww-node-name'>{node.name}</span>
    </div>
  )
}

/** Curved beams from the encrypted core to each device (viewBox units). */
function Beams({
  id,
  viewBox,
  core,
  ends,
}: {
  id: string
  viewBox: string
  core: [number, number]
  ends: Record<string, [number, number]>
}) {
  return (
    <svg
      className={`ww-beams ww-beams-${id}`}
      viewBox={viewBox}
      preserveAspectRatio='none'
      aria-hidden
    >
      <defs>
        <linearGradient id={`ww-beam-${id}`} x1='0' x2='1' y1='0' y2='0'>
          <stop offset='0' stopColor='#9af5c3' stopOpacity='0' />
          <stop offset='0.5' stopColor='#9af5c3' />
          <stop offset='1' stopColor='#5eead4' stopOpacity='0' />
        </linearGradient>
      </defs>
      {Object.entries(ends).map(([node, [x, y]]) => {
        const [cx, cy] = core
        const mx = (x + cx) / 2
        const d = `M ${cx} ${cy} C ${mx} ${cy}, ${mx} ${y}, ${x} ${y}`
        return (
          <g key={node} data-beam={node}>
            <path className='ww-beam-base' d={d} />
            <path className='ww-beam-light' d={d} pathLength={100} />
          </g>
        )
      })}
    </svg>
  )
}

export function Sync({ t }: { t: LandingMessages }) {
  const s = t.sync
  const nodes: Node[] = [
    { id: 'watch', kind: 'watch', name: 'Apple Watch' },
    { id: 'phone', kind: 'phone', name: 'iPhone' },
    { id: 'fold', kind: 'fold', name: 'iPhone Duo' },
    { id: 'tablet', kind: 'tablet', name: 'iPad' },
    { id: 'android', kind: 'android', name: 'Android' },
  ]
  return (
    <section
      id='sync'
      className='relative overflow-hidden py-24 sm:py-32'
      aria-labelledby='ww-sync-title'
    >
      <div className='ww-sync-bg' aria-hidden />
      <div className='relative mx-auto max-w-[1200px] px-5 sm:px-8'>
        <SectionHeading
          id='ww-sync-title'
          eyebrow={s.eyebrow}
          title={s.title}
          body={s.body}
        />

        <Reveal variant='scale' className='mt-14'>
          <div
            className='ww-sync'
            data-ww-sync=''
            suppressHydrationWarning
            data-phase='done'
            role='img'
            aria-label={s.demo.alt}
          >
            <Beams
              id='wide'
              viewBox='0 0 1000 520'
              core={[500, 280]}
              ends={{
                watch: [95, 330],
                phone: [280, 250],
                fold: [500, 95],
                tablet: [720, 250],
                android: [905, 330],
              }}
            />
            <Beams
              id='tall'
              viewBox='0 0 400 600'
              core={[200, 300]}
              ends={{
                watch: [70, 95],
                phone: [330, 100],
                fold: [200, 505],
                tablet: [72, 330],
                android: [328, 330],
              }}
            />
            <div className='ww-core' aria-hidden>
              <span className='ww-core-ring' />
              <span className='ww-core-ring ww-core-ring-2' />
              <span className='ww-core-disc'>
                <LockKeyhole className='size-[38%]' />
              </span>
              <span className='ww-core-label'>{s.demo.encrypted}</span>
            </div>
            {nodes.map((node) => (
              <Device key={node.id} node={node} t={t} />
            ))}
            <div className='ww-sync-toast' aria-hidden>
              <span className='ww-toast'>
                <span className='ww-toast-icon'>
                  <Check className='size-3' strokeWidth={3} />
                </span>
                <span>
                  <strong className='font-semibold'>{s.demo.added}</strong>{' '}
                  <span className='text-[var(--ww-muted)]'>{s.demo.on}</span>
                </span>
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal as='p' className='ww-foot mt-10 text-center' delay={120}>
          {t.supporter.included}
        </Reveal>
      </div>
    </section>
  )
}
