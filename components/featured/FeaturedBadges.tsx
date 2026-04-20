import { BADGES } from "@/app/featured/badges.manifest"

export default function FeaturedBadges() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-center text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Featured On
      </h1>

      <div className="mt-3 rounded-xl border border-neutral-200/80 bg-neutral-50/70 p-3">
        <div className="grid max-h-[112px] grid-cols-2 place-items-center gap-x-3 gap-y-2 overflow-hidden sm:grid-cols-3 md:grid-cols-4">
          {BADGES.map((b) => (
            <a
              key={b.href}
              href={b.href}
              target="_blank"
              rel="noopener"
              className="inline-flex w-full items-center justify-center"
            >
              <img
                src={b.img}
                alt={b.name}
                className="h-7 max-w-[140px] object-contain opacity-90 transition-opacity hover:opacity-100"
              />
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}
