import MetroPageFaqAccordion from '@/components/metro/MetroPageFaqAccordion'
import type { MetroFaqItem } from '@/lib/seo/copy/metroPageCopy'

type MetroPageFaqProps = {
  items: MetroFaqItem[]
}

export default function MetroPageFaq({ items }: MetroPageFaqProps) {
  return <MetroPageFaqAccordion items={items} />
}
