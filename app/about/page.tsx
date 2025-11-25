import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'About · LootAura',
  description: 'Learn about LootAura, a map-first platform for discovering yard sales, garage sales, and estate sales near you.',
}

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-3xl mx-auto px-4 md:px-6 lg:px-8 py-10 md:py-12">
        <h1 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">About Loot Aura</h1>
        
        <div className="prose prose-gray max-w-none">
          <p className="text-lg text-gray-700 mb-4">
            Loot Aura is a map-first platform designed to help you discover yard sales, garage sales, and estate sales in your area. 
            We believe that finding great deals should be as simple as looking at a map.
          </p>

          <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">How It Works</h2>
          <p className="text-gray-700 mb-4">
            Our platform makes it easy to find sales near you:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 mb-6">
            <li>Browse an interactive map showing all available sales in your area</li>
            <li>Filter by date, distance, and categories to find exactly what you're looking for</li>
            <li>View detailed information about each sale, including photos, items, and seller details</li>
            <li>Save your favorite sales for easy access later</li>
            <li>Post your own sales to reach local buyers quickly</li>
          </ul>

          <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Who We're For</h2>
          <p className="text-gray-700 mb-4">
            Loot Aura is perfect for:
          </p>
          <ul className="list-disc list-inside text-gray-700 space-y-2 mb-6">
            <li><strong>Treasure Hunters:</strong> People who love finding unique items and great deals at yard sales</li>
            <li><strong>Homeowners:</strong> Those looking to declutter and sell items they no longer need</li>
            <li><strong>Estate Sale Organizers:</strong> Professionals managing estate sales who want to reach more buyers</li>
            <li><strong>Local Communities:</strong> Neighbors who want to support each other through buying and selling locally</li>
          </ul>

          <h2 className="text-2xl font-semibold text-gray-900 mt-8 mb-4">Our Mission</h2>
          <p className="text-gray-700 mb-4">
            We're committed to making it easier for people to discover and participate in local yard sales. 
            By combining modern mapping technology with a user-friendly interface, we help connect buyers and sellers 
            in communities across the country.
          </p>
        </div>
      </div>
    </div>
  )
}

