import Link from 'next/link'

export function CoreFlowsSection() {
  const showAdmin = process.env.NEXT_PUBLIC_DEBUG === 'true'

  const flows = [
    {
      title: 'Browse sales on the map',
      description: 'Explore listings with photos, details, and maps. Filter by distance and category.',
      href: '/sales',
      icon: '🗺️',
    },
    {
      title: 'Post your sale',
      description: 'Create a listing with images and attract local buyers. It only takes a minute.',
      href: '/sell/new',
      icon: '📝',
    },
    {
      title: 'How it works',
      description: 'Learn how to find the best deals and host successful yard sales in your area.',
      href: '/about',
      icon: '❓',
    },
    ...(showAdmin ? [{
      title: 'Admin tools',
      description: 'Debugging and development tools for testing and diagnostics.',
      href: '/admin/tools',
      icon: '🔧',
    }] : []),
  ]

  return (
    <section className="py-10 lg:py-12 bg-white">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <h2 className="text-xl font-semibold text-aura-navy mb-6">What do you want to do today?</h2>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {flows.map((flow, i) => (
            <Link
              key={i}
              href={flow.href}
              className="rounded-2xl border border-aura-cream bg-white p-6 shadow-sm hover:shadow-md hover:translate-y-[1px] transition-all"
            >
              <div className="text-3xl mb-3">{flow.icon}</div>
              <h3 className="text-lg font-semibold text-aura-navy mb-2">{flow.title}</h3>
              <p className="text-sm text-aura-navy/70">{flow.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}

