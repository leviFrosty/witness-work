import { describe, expect, it } from 'vitest'
import { center, toScreen, windowOrigin } from './ax.mjs'

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

// The shape of `axe describe-ui --point 1,1` outside a resized window: the
// SpringBoard app switcher, with the window's card framed on screen.
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
    // The Contacts tab in a 391 × 665 window at (321, 298).
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
