import "./globals.css"
import { Metadata } from 'next'
import { Providers } from './providers'
import WebVitals from '@/components/WebVitals'
import { ConditionalHeader } from '@/components/landing/ConditionalHeader'
import { PWAComponents } from './PWAComponents'
import DebugToggle from '@/components/debug/DebugToggle'
import { createHomepageStructuredData, createOrganizationStructuredData } from '@/lib/metadata'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
// Disable Mapbox telemetry at app startup
import '@/lib/maps/telemetry'

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
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createHomepageStructuredData()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createOrganizationStructuredData()) }}
        />
        <Providers>
          <ConditionalHeader />
          <WebVitals />
          {children}
          <PWAComponents />
          <DebugToggle />
          <ToastContainer
            position="bottom-right"
            autoClose={3000}
            hideProgressBar={false}
            newestOnTop={false}
            closeOnClick
            rtl={false}
            pauseOnFocusLoss
            draggable
            pauseOnHover
            theme="light"
          />
        </Providers>
      </body>
    </html>
  )
}
