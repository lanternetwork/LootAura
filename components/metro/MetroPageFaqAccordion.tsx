'use client'

import { useId, useState, type KeyboardEvent } from 'react'
import type { MetroFaqItem } from '@/lib/seo/copy/metroPageCopy'

type MetroPageFaqAccordionProps = {
  items: MetroFaqItem[]
}

export default function MetroPageFaqAccordion({ items }: MetroPageFaqAccordionProps) {
  const baseId = useId()
  const [openIndex, setOpenIndex] = useState(0)

  if (items.length === 0) return null

  function toggle(index: number) {
    setOpenIndex((current) => (current === index ? -1 : index))
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      toggle(index)
    }
  }

  return (
    <section
      className="mt-12 rounded-2xl border border-gray-200 bg-white px-5 py-7 shadow-sm sm:px-7 sm:py-8"
      aria-labelledby={`${baseId}-heading`}
    >
      <h2 id={`${baseId}-heading`} className="text-xl font-semibold text-gray-900 sm:text-2xl">
        Frequently asked questions
      </h2>
      <div className="mt-5 divide-y divide-gray-200 border-t border-gray-200">
        {items.map((item, index) => {
          const isOpen = openIndex === index
          const buttonId = `${baseId}-button-${index}`
          const panelId = `${baseId}-panel-${index}`

          return (
            <div key={item.question}>
              <h3>
                <button
                  type="button"
                  id={buttonId}
                  className="flex w-full items-center justify-between gap-4 py-4 text-left text-base font-semibold text-gray-900 transition hover:text-[#3A2268] sm:text-lg"
                  aria-expanded={isOpen}
                  aria-controls={panelId}
                  onClick={() => toggle(index)}
                  onKeyDown={(event) => onKeyDown(event, index)}
                >
                  <span>{item.question}</span>
                  <span className="text-xl text-[#3A2268]" aria-hidden>
                    {isOpen ? '−' : '+'}
                  </span>
                </button>
              </h3>
              <div
                id={panelId}
                role="region"
                aria-labelledby={buttonId}
                hidden={!isOpen}
                className="pb-4 text-sm leading-relaxed text-gray-600 sm:text-base"
              >
                {item.answer}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
