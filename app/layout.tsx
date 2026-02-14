import "./globals.css"
import { Metadata } from 'next'
import Script from 'next/script'
import { Suspense } from 'react'
import { Providers } from './providers'
import WebVitals from '@/components/WebVitals'
import { ConditionalHeader } from '@/components/landing/ConditionalHeader'
import { PWAComponents } from './PWAComponents'
import DebugToggle from '@/components/debug/DebugToggle'
import { ErrorBoundary } from '@/components/system/ErrorBoundary'
import SkipToContent from '@/components/a11y/SkipToContent'
import { createHomepageStructuredData, createOrganizationStructuredData } from '@/lib/metadata'
import { ToastContainer } from 'react-toastify'
import 'react-toastify/dist/ReactToastify.css'
// Disable Mapbox telemetry at app startup
import '@/lib/maps/telemetry'
import CsrfTokenInitializer from '@/components/csrf/CsrfTokenInitializer'
import ClarityClient from '@/components/analytics/ClarityClient'
import { ConditionalFooter } from '@/components/layout/ConditionalFooter'
import { ENV_PUBLIC } from '@/lib/env'
import { AuthStateRefresher } from '@/components/auth/AuthStateRefresher'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL || 'https://lootaura.app').replace(/\/$/, '')
const defaultOgImage = `${siteUrl}/og-default.png`

// Safely construct metadataBase URL
let metadataBaseUrl: URL | undefined
try {
  metadataBaseUrl = new URL(siteUrl)
} catch (error) {
  // If siteUrl is invalid, don't set metadataBase
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.warn('[LAYOUT] Invalid siteUrl for metadataBase:', siteUrl)
  }
}

export const metadata: Metadata = {
  ...(metadataBaseUrl && { metadataBase: metadataBaseUrl }),
  title: 'LootAura · Yard Sales Near You',
  description: 'Find and post yard sales, garage sales, and local deals on an interactive map.',
  keywords: 'yard sale, garage sale, estate sale, local sales, treasure hunting',
  openGraph: {
    title: 'LootAura · Yard Sales Near You',
    description: 'Find and post yard sales, garage sales, and local deals on an interactive map.',
    type: 'website',
    url: siteUrl,
    siteName: 'LootAura',
    images: [
      {
        url: defaultOgImage,
        width: 1200,
        height: 630,
        alt: 'LootAura - Yard Sales Near You',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'LootAura · Yard Sales Near You',
    description: 'Find and post yard sales, garage sales, and local deals on an interactive map.',
    images: [defaultOgImage],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Gate AdSense script and meta tag based on feature flag
  const adsenseEnabled = process.env.NEXT_PUBLIC_ENABLE_ADSENSE === 'true' || process.env.NEXT_PUBLIC_ENABLE_ADSENSE === '1'

  return (
    <html lang="en">
      <head>
        {adsenseEnabled && (
          <meta name="google-adsense-account" content="ca-pub-8685093412475036" />
        )}
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="LootAura" />
        <meta name="theme-color" content="#0b3d2e" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        {ENV_PUBLIC.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION && (
          <meta name="google-site-verification" content={ENV_PUBLIC.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION} />
        )}
      </head>
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        {adsenseEnabled && (
          <Script
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8685093412475036"
            strategy="afterInteractive"
            crossOrigin="anonymous"
          />
        )}
        <SkipToContent />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createHomepageStructuredData()) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(createOrganizationStructuredData()) }}
        />
        <Providers>
          <ErrorBoundary>
            <Suspense fallback={null}>
              <AuthStateRefresher />
            </Suspense>
            <CsrfTokenInitializer />
            <ClarityClient />
            <ConditionalHeader />
            <WebVitals />
            <main id="main-content" tabIndex={-1}>
              {children}
            </main>
            <ConditionalFooter />
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
          </ErrorBoundary>
        </Providers>
      </body>
    </html>
  )
}
