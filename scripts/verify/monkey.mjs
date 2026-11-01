import fs from 'node:fs'
import path from 'node:path'

const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'

const AVOID =
  /delete|remove|reset|erase|wipe|restore|restart onboarding|sign out|log out|purchase|subscribe|buy|donat|support|tip|restore purchases|share|export|send|email|e-mail|call|message|text |sms|open settings|app store|play store|review|rate |website|privacy policy|terms|import|icloud|backup|developer|reload|disconnect|unpair|leave|navigate|directions|maps|open in/i

const PRESSABLE =
  /button|link|tab|switch|cell|checkbox|segment|menuitem|radio|toggle|image ?button/i
const EDITABLE = /textfield|searchfield|edittext|securetext/i

const FUZZ_TEXT = [
  '0',
  '-1',
  '999999',
  '1.5',
  '٣٤',
  '日本語のテキスト',
  'مرحبا بالعالم',
  '👨‍👩‍👧‍👦🙏🏽✨',
  'O\'Brien "quoted" <b>tag</b>',
  ' leading and trailing ',
  'a'.repeat(512),
  '%s %n {{x}} ${x}',
  'Zalgo T̴̡̛͓e̸̢̛͎x̷̺̊t̶̳̆',
  '‮right-to-left override',
]

export const MAX_REFOCUS_SHARE = 0.25

export function isStuck(refocused, steps) {
  return refocused > steps * MAX_REFOCUS_SHARE
}

export function androidFocus(dumpsys) {
  const current = dumpsys.match(/mCurrentFocus=(.*)/)?.[1]?.trim() ?? ''
  const app = dumpsys.match(/mFocusedApp=(.*)/)?.[1] ?? ''
  if (current.includes(`${BUNDLE_ID}/`)) return 'app'
  if (!app.includes(`${BUNDLE_ID}/`)) return 'other'
  const window = current.match(/^Window\{\S+ \S+ (.+)\}$/)?.[1] ?? current
  if (!window || window === 'null') return 'app'
  return !window.includes('/') &&
    !/NotificationShade|StatusBar|InputMethod|Launcher/i.test(window)
    ? 'popup'
    : 'other'
}

export const focusIsOurs = (dumpsys) => androidFocus(dumpsys) !== 'other'

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function parseSnapshot(stdout) {
  try {
    return JSON.parse(stdout).data?.nodes ?? []
  } catch {
    return []
  }
}

function candidates(nodes) {
  return nodes.filter((node) => {
    if (node.enabled === false || node.hittable === false || !node.ref)
      return false

    const owner = node.bundleId ?? node.packageName ?? node.package
    if (owner && owner !== BUNDLE_ID) return false
    const label = `${node.label ?? ''} ${node.identifier ?? ''}`
    if (AVOID.test(label)) return false

    const androidPressable =
      node.hittable === true &&
      !/ScrollView|TextView|RecyclerView/.test(node.type ?? '')
    return (
      PRESSABLE.test(node.type ?? '') ||
      androidPressable ||
      EDITABLE.test(node.type ?? '') ||
      node.editable
    )
  })
}

export async function runMonkey(options) {
  const {
    platform,
    device,
    steps,
    seed,
    scenario,
    eval: evaluate,
    agentDevice,
    shot,
    run,
    outDir,
  } = options
  const random = mulberry32(seed)
  const pick = (items) => items[Math.floor(random() * items.length)]
  const logPath = path.join(outDir, `monkey-${platform}-seed${seed}.jsonl`)
  const logStream = fs.openSync(logPath, 'w')
  const pause = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
  const write = (entry) => fs.writeSync(logStream, `${JSON.stringify(entry)}\n`)

  await options.relaunch()
  await evaluate(`__WW_DEV__.seed(${JSON.stringify(scenario)})`)
  await evaluate('__WW_DEV__.clearErrors()')
  write({ step: 0, action: 'seed', scenario, seed })

  const look = () => {
    const snapshot = agentDevice(['snapshot', '-i', '--json'])
    return { snapshot, targets: candidates(parseSnapshot(snapshot.stdout)) }
  }

  for (let i = 0; i < 10 && !look().targets.length; i++) await pause(1500)

  const foreground = () => {
    options.beforeForeground?.()
    if (platform === 'ios')
      run('xcrun', ['simctl', 'launch', device.id, BUNDLE_ID], { check: false })
    else
      run(
        'adb',
        [
          '-s',
          device.id,
          'shell',
          'monkey',
          '-p',
          BUNDLE_ID,
          '-c',
          'android.intent.category.LAUNCHER',
          '1',
        ],
        { check: false }
      )
  }

  const focus = () =>
    platform !== 'android'
      ? 'app'
      : androidFocus(
          run(
            'adb',
            [
              '-s',
              device.id,
              'shell',
              "dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'",
            ],
            { check: false }
          ).stdout
        )

  const dismiss = () => {
    if (platform !== 'android') agentDevice(['alert', 'dismiss'])
    else if (focus() !== 'app')
      run('adb', ['-s', device.id, 'shell', 'input', 'keyevent', '4'], {
        check: false,
      })
  }

  let failure = null
  let actions = 0
  let refocused = 0
  let deadEnds = 0
  let inARow = 0
  const refocus = (step, entry) => {
    refocused++
    inARow++
    write({ step, ...entry })
    if (inARow >= 2) {
      write({ step, action: 'dismiss', reason: `${inARow} refocuses in a row` })
      dismiss()
    }
    if (isStuck(refocused, steps))
      failure = {
        step,
        kind: 'stuck',
        detail: `${refocused} of ${steps} steps had to refocus or relaunch the app (over ${MAX_REFOCUS_SHARE * 100}%); something keeps covering it. See the log and screenshot.`,
      }
  }
  for (let step = 1; step <= steps && !failure; step++) {
    if (focus() === 'other') {
      refocus(step, { action: 'refocus', reason: 'another app is in front' })
      foreground()
      continue
    }
    let { snapshot, targets } = look()
    if (
      /circuit-disabled|No snapshot backend could read/.test(
        `${snapshot.stdout}${snapshot.stderr}`
      )
    ) {
      refocus(step, {
        action: 'relaunch',
        reason: 'snapshot backend disabled',
      })
      await options.relaunch()
      continue
    }

    if (!targets.length) {
      await pause(1500)
      ;({ targets } = look())
    }
    if (!targets.length) {
      deadEnds++
      refocus(step, {
        action: deadEnds >= 3 ? 'reset-home' : 'refocus',
        reason: 'no targets',
      })
      foreground()
      if (deadEnds >= 3) {
        await evaluate("__WW_DEV__.navigate('Root')").catch(() => null)
        deadEnds = 0
      }
      continue
    }
    deadEnds = 0
    inARow = 0
    const roll = random()
    let entry

    const canGoBack =
      roll < 0.08 &&
      (await evaluate('__WW_DEV__.state().canGoBack', 5000).catch(() => false))
    if (canGoBack) {
      entry = { action: 'back' }
      agentDevice(['back', '--settle'])
    } else if (roll < 0.16) {
      entry = { action: 'scroll', direction: pick(['down', 'up']) }
      agentDevice(['scroll', entry.direction, '--settle'])
    } else {
      const target = pick(targets)
      const editable = EDITABLE.test(target.type ?? '') || target.editable
      if (editable) {
        entry = {
          action: 'fill',
          label: target.label,
          type: target.type,
          text: pick(FUZZ_TEXT),
        }
        agentDevice(['fill', `@${target.ref}`, entry.text, '--settle'])
        if (platform === 'ios') agentDevice(['keyboard', 'dismiss'])
      } else {
        entry = { action: 'press', label: target.label, type: target.type }
        agentDevice(['press', `@${target.ref}`, '--settle'])
      }
    }
    actions++
    write({ step, ...entry })

    if (step % 3 === 0 || step === steps) {
      let summary
      try {
        summary = await evaluate('__WW_DEV__.state()', 10_000)
      } catch (error) {
        foreground()
        await new Promise((resolve) => setTimeout(resolve, 8000))
        summary = await evaluate('__WW_DEV__.state()', 10_000).catch(() => null)
        if (!summary) {
          const alive =
            platform === 'ios'
              ? run(
                  'xcrun',
                  ['simctl', 'spawn', device.id, 'launchctl', 'list'],
                  { check: false }
                ).stdout.includes(BUNDLE_ID)
              : run('adb', ['-s', device.id, 'shell', 'pidof', BUNDLE_ID], {
                  check: false,
                }).stdout.trim() !== ''
          failure = {
            step,
            kind: alive ? 'js-runtime-unreachable' : 'app-crashed',
            detail: error.message,
          }
          break
        }
        write({ step, action: 'recovered-after-unresponsive' })
      }
      write({ step, route: summary.route?.name, errors: summary.errors })
      if (summary.errors > 0) {
        failure = {
          step,
          kind: 'js-error',
          errors: await evaluate('__WW_DEV__.errors()'),
        }
      }
    }
  }

  const screenshot = failure
    ? shot(`monkey-failure-seed${seed}`)
    : shot(`monkey-end-seed${seed}`)
  fs.closeSync(logStream)
  const summary = {
    ok: !failure,
    platform,
    seed,
    scenario,
    steps,
    actions,
    refocused,
    realActionShare:
      Math.round((actions / Math.max(1, actions + refocused)) * 100) / 100,
    failure,
    log: path.relative(options.root, logPath),
    screenshot,
    replay: `node scripts/verify/ww-verify.mjs monkey --platform ${platform} --seed ${seed} --steps ${steps} --scenario ${scenario}`,
  }
  fs.writeFileSync(
    path.join(outDir, `monkey-${platform}-seed${seed}.json`),
    JSON.stringify(summary, null, 2)
  )
  return { summary }
}
