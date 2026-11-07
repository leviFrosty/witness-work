let epoch = 0

export const photoEpoch = (): number => epoch

export const endPhotoPasses = (): void => {
  epoch++
}
