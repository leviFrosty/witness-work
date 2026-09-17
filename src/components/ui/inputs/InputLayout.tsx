import { createContext, useContext } from 'react'

/** Forms use the shared settings treatment by default; the drawer opts in. */
const InputLayoutContext = createContext<'settings' | 'drawer'>('settings')

export const InputLayoutProvider = InputLayoutContext.Provider
export const useInputLayout = () => useContext(InputLayoutContext)

export const inputLayout = {
  rowMinHeight: 68,
  rowPadding: 12,
  horizontalPadding: 12,
  iconSize: 20,
  labelGap: 12,
  sectionBorderWidth: 1,
  controlGap: 10,
  descriptionGap: 4,
  controlMinHeight: 44,
  controlMaxWidth: 200,
  contentMaxWidth: 680,
}

export const drawerLayout = {
  rowMinHeight: 44,
  rowPaddingVertical: 10,
  rowGap: 2,
  sectionGap: 32,
  horizontalPadding: 16,
  iconSize: 20,
  labelGap: 12,
}
