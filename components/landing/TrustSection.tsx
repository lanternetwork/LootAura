export function TrustSection() {
  const features = [
    { title: 'Built for neighborhoods', description: 'Connect with local buyers and sellers in your community.' },
    { title: 'Map-first', description: 'See everything happening near you at a glance.' },
    { title: 'Safe image uploads', description: 'Cloudinary-powered secure image hosting.' },
    { title: 'Free to get started', description: 'No fees to list or browse sales.' },
  ]

  return (
    <section className="py-12 bg-aura-cream">
      <div className="mx-auto max-w-6xl px-4 lg:px-8">
        <h2 className="text-xl font-semibold text-aura-navy mb-6 text-center">Why choose LootAura?</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {features.map((feature, i) => (
            <div key={i} className="text-center">
              <h3 className="text-lg font-semibold text-aura-navy mb-2">{feature.title}</h3>
              <p className="text-sm text-aura-navy/70">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

