import { absoluteUrl } from '@/lib/paths'

/** Title, description, canonical, and share tags for a page at `path`. */
export function PageMeta({
  title,
  description,
  path,
}: {
  title: string
  description: string
  path: string
}) {
  const url = absoluteUrl(path)
  const image = absoluteUrl('/images/og.png')
  return (
    <>
      <title>{title}</title>
      <meta name='description' content={description} />
      <meta property='og:type' content='website' />
      <meta property='og:title' content={title} />
      <meta property='og:description' content={description} />
      <meta property='og:url' content={url} />
      <meta property='og:image' content={image} />
      <meta name='twitter:card' content='summary_large_image' />
      <link rel='canonical' href={url} />
    </>
  )
}
