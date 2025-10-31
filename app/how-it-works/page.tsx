import Link from 'next/link'

const steps = {
  shoppers: [
    {
      title: '1. Set your location',
      body: 'Enter a ZIP or let the browser detect where you are. We only show sales near you.',
    },
    {
      title: '2. Filter the map',
      body: 'Pick dates, categories (tools, kids, furniture), and distance. The list follows the map.',
    },
    {
      title: '3. Go shop',
      body: 'Open the sale, see photos, hours, and location, then drive over.',
    },
  ],
  hosts: [
    {
      title: '1. Create a sale',
      body: 'Add title, description, dates, and your address. It\'s designed to be mobile-first.',
    },
    {
      title: '2. Add photos',
      body: 'Upload a few photos. The first one becomes the cover photo on the map and in lists.',
    },
    {
      title: '3. Publish',
      body: 'Your sale appears on the map right away for people nearby.',
    },
  ],
  admins: [
    {
      title: '1. Map-centric',
      body: 'The map is the source of truth. Everything flows from the current viewport.',
    },
    {
      title: '2. Protected data',
      body: 'We use auth + RLS so people only see and edit their own sales.',
    },
    {
      title: '3. Tools for cleanup',
      body: 'Admin tools help find unhealthy listings, spam, or duplicates.',
    },
  ],
}

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-[#F9FFF2]">
      {/* hero */}
      <section className="mx-auto max-w-6xl px-4 pt-16 pb-10 lg:pt-24 lg:pb-16">
        <div className="max-w-3xl">
          <p className="inline-flex rounded-full bg-[#E9F6D1] px-3 py-1 text-xs font-medium text-[#3A2268]/80">
            Loot Aura · Local sales, map-first
          </p>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-[#3A2268] lg:text-5xl">
            How Loot Aura works
          </h1>
          <p className="mt-4 text-base text-[#3A2268]/75 lg:text-lg">
            A simple flow for shoppers, hosts, and community organizers. No apps to install. Just a map.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/sales"
              className="rounded-full bg-[#3A2268] px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#2b1950]"
            >
              Browse nearby sales
            </Link>
            <Link
              href="/sell/new"
              className="rounded-full bg-white/80 px-6 py-2 text-sm font-medium text-[#3A2268] border border-[#E3E7F2] hover:bg-white"
            >
              Host a sale
            </Link>
          </div>
        </div>
      </section>

      {/* shoppers */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-xl font-semibold text-[#3A2268]">For shoppers</h2>
        <p className="mt-2 text-sm text-[#3A2268]/60 max-w-2xl">
          Find yard, garage, and community sales near you — filtered by date, category, and distance.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.shoppers.map((step) => (
            <div key={step.title} className="rounded-2xl bg-white/90 border border-[#E3E7F2] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#3A2268]">{step.title}</h3>
              <p className="mt-2 text-sm text-[#3A2268]/70">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* hosts */}
      <section className="mx-auto max-w-6xl px-4 pb-12">
        <h2 className="text-xl font-semibold text-[#3A2268]">For hosts</h2>
        <p className="mt-2 text-sm text-[#3A2268]/60 max-w-2xl">
          Posting a sale takes just a couple of steps and your listing appears on the shared map right away.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.hosts.map((step) => (
            <div key={step.title} className="rounded-2xl bg-white/90 border border-[#E3E7F2] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#3A2268]">{step.title}</h3>
              <p className="mt-2 text-sm text-[#3A2268]/70">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* admins / tech */}
      <section className="mx-auto max-w-6xl px-4 pb-16">
        <h2 className="text-xl font-semibold text-[#3A2268]">Under the hood</h2>
        <p className="mt-2 text-sm text-[#3A2268]/60 max-w-2xl">
          Map-centric, Supabase-backed, RLS-enforced. Built to stay fast even with 1,000+ pins.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          {steps.admins.map((step) => (
            <div key={step.title} className="rounded-2xl bg-white/90 border border-[#E3E7F2] p-5 shadow-sm">
              <h3 className="text-sm font-semibold text-[#3A2268]">{step.title}</h3>
              <p className="mt-2 text-sm text-[#3A2268]/70">{step.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-2xl bg-white/70 border border-dashed border-[#E3E7F2] p-6 flex flex-wrap gap-4 items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-[#3A2268]">Ready to try it?</h3>
            <p className="text-sm text-[#3A2268]/70">
              Jump to the live map or post a sale — everything else is optional.
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/sales"
              className="rounded-full bg-[#3A2268] px-5 py-2 text-sm font-medium text-white shadow-sm"
            >
              View sales
            </Link>
            <Link
              href="/sell/new"
              className="rounded-full bg-white/80 px-5 py-2 text-sm font-medium text-[#3A2268] border border-[#E3E7F2]"
            >
              Post a sale
            </Link>
          </div>
        </div>
      </section>
    </main>
  )
}

