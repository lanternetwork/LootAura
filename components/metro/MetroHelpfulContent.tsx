import Link from 'next/link'

type MetroHelpfulContentProps = {
  paragraphs: string[]
  interactiveMapHref: string
}

export default function MetroHelpfulContent({
  paragraphs,
  interactiveMapHref,
}: MetroHelpfulContentProps) {
  if (paragraphs.length === 0) return null

  return (
    <section className="mt-12 rounded-xl border border-gray-200 bg-white px-6 py-8" aria-labelledby="metro-helpful-heading">
      <h2 id="metro-helpful-heading" className="text-xl font-semibold text-gray-900">
        About this metro page
      </h2>
      <div className="prose prose-sm mt-4 max-w-none text-gray-700">
        {paragraphs.map((paragraph) => {
          const isMapLink = paragraph.startsWith('Continue to the interactive map:')
          if (isMapLink) {
            return (
              <p key={paragraph}>
                <Link href={interactiveMapHref} className="font-medium text-purple-700 hover:text-purple-900">
                  Open the interactive map for {interactiveMapHref.includes('city=') ? 'this city' : 'live search'} →
                </Link>
              </p>
            )
          }
          const isCityLink = paragraph.includes('see the city page:')
          if (isCityLink) {
            const href = paragraph.split('see the city page: ')[1]?.trim()
            if (href) {
              return (
                <p key={paragraph}>
                  {paragraph.replace(`see the city page: ${href}`, '').trim()}{' '}
                  <Link href={href} className="font-medium text-purple-700 hover:text-purple-900">
                    View all active listings →
                  </Link>
                </p>
              )
            }
          }
          return <p key={paragraph.slice(0, 48)}>{paragraph}</p>
        })}
      </div>
    </section>
  )
}
