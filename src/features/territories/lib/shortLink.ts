export const shortLink = (url: string): string => {
  const bare = url.replace(/^https?:\/\//, '')
  const [address = '', secret = ''] = bare.split('#')
  if (secret.length <= 10) return bare
  return `${address.split('/')[0]}/…${secret.slice(-6)}`
}
