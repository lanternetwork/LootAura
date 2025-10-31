import "./globals.css"
import { Metadata } from 'next'
import { Providers } from './providers'
import WebVitals from '@/components/WebVitals'
import { Header } from './Header'
import { PWAComponents } from './PWAComponents'
import DebugToggle from '@/components/debug/DebugToggle'
import { createHomepageStructuredData, createOrganizationStructuredData } from '@/lib/metadata'
// Disable Mapbox telemetry at app startup
import '@/lib/maps/telemetry'
import { Inter, Poppins } from 'next/font/google'

const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-body' })
const poppins = Poppins({ subsets: ['latin'], weight: ['400','500','600','700'], display: 'swap', variable: '--font-heading' })

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export const metadata: Metadata = {
  title: 'Loot Aura - Find Amazing Yard Sale Treasures',
  description: 'Discover local yard sales, garage sales, and estate sales in your area. Never miss a great deal again!',
  keywords: 'yard sale, garage sale, estate sale, local sales, treasure hunting',
  openGraph: {
    title: 'Loot Aura - Find Amazing Yard Sale Treasures',
    description: 'Discover local yard sales, garage sales, and estate sales in your area.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0b3d2e" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body className={`${inter.variable} ${poppins.variable} min-h-screen bg-aura-cream text-aura-navy`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createHomepageStructuredData()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createOrganizationStructuredData()) }}
        />
        <Providers>
          <Header />
          <WebVitals />
          {children}
          <PWAComponents />
          <DebugToggle />
        </Providers>
      </body>
    </html>
  )
}
