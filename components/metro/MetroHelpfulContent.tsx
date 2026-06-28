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
    <section
      className="mt-12 rounded-2xl border border-gray-200 bg-white px-5 py-7 shadow-sm sm:px-8 sm:py-9"
      aria-labelledby="metro-helpful-heading"
    >
      <h2 id="metro-helpful-heading" className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl">
        About this metro page
      </h2>
      <div className="mt-5 space-y-4 text-base leading-relaxed text-gray-700">
        {paragraphs.map((paragraph) => {
          const isMapLink = paragraph.startsWith('Continue to the interactive map:')
          if (isMapLink) {
            return (
              <p key={paragraph}>
                <Link
                  href={interactiveMapHref}
                  className="font-semibold text-[#3A2268] underline decoration-purple-200 underline-offset-2 hover:text-[#2f1a52]"
                >
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
                  <Link
                    href={href}
                    className="font-semibold text-[#3A2268] underline decoration-purple-200 underline-offset-2 hover:text-[#2f1a52]"
                  >
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
