export const mapLinkHost = (link: string): string => {
  const text = link.trim()
  const host = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?([^/?#:]+)/i.exec(
    text
  )?.[1]
  return host ? host.toLowerCase().replace(/^www\./, '') : text
}
