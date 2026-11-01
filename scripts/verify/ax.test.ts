import { describe, expect, it } from 'vitest'
import {
  center,
  flatten,
  matchesSelector,
  parseSelector,
  toScreen,
  windowOrigin,
} from './ax.mjs'

const BUNDLE_ID = 'com.leviwilkerson.jwtimedev'

const node = (
  frame: { x: number; y: number; width: number; height: number },
  extra: Record<string, unknown> = {},
  children: unknown[] = []
) => ({
  type: 'Group',
  AXLabel: null,
  AXUniqueId: null,
  frame,
  ...extra,
  children,
})

const springboard = node(
  { x: 0, y: 0, width: 1032, height: 1376 },
  { AXUniqueId: 'AppSwitcherContentView' },
  [
    node({ x: 0, y: 0, width: 1032, height: 1376 }),
    node({ x: 320.5, y: 298, width: 391, height: 665 }, {}, [
      node({ x: 320.5, y: 298, width: 391, height: 665 }),
    ]),
    node(
      { x: 321, y: 298, width: 391, height: 665 },
      {
        AXLabel: 'WitnessWork Dev',
        AXUniqueId: `card:${BUNDLE_ID}:sceneID:${BUNDLE_ID}-default`,
      },
      [
        node(
          { x: 342, y: 319, width: 41, height: 22 },
          {
            type: 'Button',
            AXLabel: 'Window Controls, WitnessWork Dev',
            AXUniqueId: `window-controls:${BUNDLE_ID}`,
          }
        ),
      ]
    ),
  ]
)

describe('windowOrigin', () => {
  it("reads the app window's place on screen from its SpringBoard card", () => {
    expect(windowOrigin(springboard, BUNDLE_ID)).toEqual({ x: 321, y: 298 })
    expect(windowOrigin([springboard], BUNDLE_ID)).toEqual({ x: 321, y: 298 })
  })

  it("ignores another app's window", () => {
    expect(windowOrigin(springboard, 'com.apple.mobilesafari')).toBeNull()
  })

  it('is null when the read landed in the app', () => {
    const app = node(
      { x: 0, y: 0, width: 1032, height: 1376 },
      { type: 'Application', AXLabel: 'WitnessWork Dev' },
      [node({ x: 0, y: 0, width: 1032, height: 1376 })]
    )
    expect(windowOrigin(app, BUNDLE_ID)).toBeNull()
  })
})

describe('toScreen', () => {
  it("moves an element's window position by the window's origin", () => {
    const tab = { x: 96, y: 610, width: 58, height: 38 }
    expect(toScreen(center(tab), { x: 321, y: 298 })).toEqual({
      x: 446,
      y: 927,
    })
  })

  it('leaves a full-screen window where it is', () => {
    expect(toScreen({ x: 272, y: 62 }, { x: 0, y: 0 })).toEqual({
      x: 272,
      y: 62,
    })
  })

  it('rounds half-point origins to whole points', () => {
    expect(toScreen({ x: 10, y: 10 }, { x: 320.5, y: 297.5 })).toEqual({
      x: 331,
      y: 308,
    })
  })
})

describe('matchesSelector', () => {
  it('matches role=switch on the CheckBox AXe reports for a switch', () => {
    const elements = flatten([
      node({ x: 0, y: 0, width: 400, height: 800 }, { type: 'Application' }, [
        node(
          { x: 300, y: 200, width: 51, height: 31 },
          { type: 'CheckBox', AXLabel: 'Back Up to WitnessWork' }
        ),
      ]),
    ])
    const toggle = elements.find((e) => e.label === 'Back Up to WitnessWork')
    expect(toggle).toBeDefined()
    expect(
      matchesSelector(
        toggle,
        parseSelector('role="switch" label="Back Up to WitnessWork"')
      )
    ).toBe(true)
    expect(matchesSelector(toggle, parseSelector('role="button"'))).toBe(false)
  })
})
