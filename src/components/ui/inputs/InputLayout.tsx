import { createContext, useContext } from 'react'

/** Forms use the shared settings treatment by default; the drawer opts in. */
const InputLayoutContext = createContext<'settings' | 'drawer'>('settings')

export const InputLayoutProvider = InputLayoutContext.Provider
export const useInputLayout = () => useContext(InputLayoutContext)

export const inputLayout = {
  rowMinHeight: 76,
  rowPadding: 16,
  horizontalPadding: 12,
  controlGap: 10,
  descriptionGap: 4,
  controlMinHeight: 44,
  controlMaxWidth: 200,
  contentMaxWidth: 680,
}

export const drawerLayout = {
  rowMinHeight: 48,
  rowPaddingVertical: 12,
  rowGap: 2,
  sectionGap: 40,
  horizontalPadding: 16,
  iconSize: 20,
  labelGap: 12,
}
