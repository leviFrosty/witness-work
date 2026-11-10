const web = typeof document !== 'undefined'

export const submitScope = web ? { dataSet: { submitScope: '' } } : undefined

export const submitHeader = web ? { dataSet: { submitHeader: '' } } : undefined
