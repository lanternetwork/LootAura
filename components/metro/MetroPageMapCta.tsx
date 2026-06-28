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
    <section className="mt-10 text-center sm:mt-12">
      <Link
        href={href}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-[#3A2268] px-6 py-3 text-sm font-semibold text-white shadow-md transition hover:bg-[#2f1a52] sm:w-auto sm:min-w-[240px] sm:text-base"
      >
        {label}
      </Link>
    </section>
  )
}
