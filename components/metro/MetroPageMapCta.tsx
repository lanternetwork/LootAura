import Link from 'next/link'

type MetroPageMapCtaProps = {
  href: string
  label?: string
}

export default function MetroPageMapCta({
  href,
  label = 'View Interactive Map',
}: MetroPageMapCtaProps) {
  return (
    <section className="mt-10 text-center">
      <Link
        href={href}
        className="inline-flex items-center justify-center rounded-lg bg-[#3A2268] px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#2f1a52]"
      >
        {label}
      </Link>
    </section>
  )
}
