export type WebFocusMode = 'inset' | 'row' | 'proxy' | 'none'

export const webFocus = (mode: WebFocusMode): object | undefined => ({
  dataSet: { wwFocus: mode },
})

export const webFocusVisual: object | undefined = {
  dataSet: { wwFocusVisual: '' },
}

export const webFocusSection: object | undefined = {
  dataSet: { wwFocusSection: '' },
}

export const webFocusRowSplit: object | undefined = {
  dataSet: { wwFocusRowSplit: '' },
}

export const webFocusNotBottom: object | undefined = {
  dataSet: { wwFocusNotBottom: '' },
}

export const webFocusHeader: object | undefined = {
  dataSet: { wwFocusHeader: '' },
}

export const webFocusPhone: object | undefined = {
  dataSet: { wwFocusPhone: '' },
}
