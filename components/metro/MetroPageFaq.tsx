import type { MetroFaqItem } from '@/lib/seo/copy/metroPageCopy'

type MetroPageFaqProps = {
  items: MetroFaqItem[]
}

export default function MetroPageFaq({ items }: MetroPageFaqProps) {
  if (items.length === 0) return null

  return (
    <section className="mt-12 rounded-xl border border-gray-200 bg-white px-6 py-8" aria-labelledby="metro-faq-heading">
      <h2 id="metro-faq-heading" className="text-xl font-semibold text-gray-900">
        Frequently asked questions
      </h2>
      <dl className="mt-6 space-y-6">
        {items.map((item) => (
          <div key={item.question}>
            <dt className="text-base font-medium text-gray-900">{item.question}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-gray-600">{item.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
