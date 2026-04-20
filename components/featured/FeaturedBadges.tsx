import { BADGES } from "@/app/featured/badges.manifest"

export default function FeaturedBadges() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="mb-4 text-center text-xl font-semibold">Featured On</h1>

      <div className="flex max-h-[96px] flex-wrap justify-center gap-2 overflow-hidden">
        {BADGES.map((b) => (
          <a
            key={b.href}
            href={b.href}
            target="_blank"
            rel="noopener"
            className="block"
          >
            <img
              src={b.img}
              alt={b.name}
              className="h-8 object-contain opacity-80 transition hover:opacity-100"
            />
          </a>
        ))}
      </div>
    </div>
  )
}
