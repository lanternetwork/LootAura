const path = require('path')
const { withSentryConfig } = require('@sentry/nextjs')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Restrict to only required remote hosts
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'res.cloudinary.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.in',
        port: '',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        port: '',
        pathname: '/**',
      },
    ],
    // Block SVG files in Next Image optimization
    dangerouslyAllowSVG: false,
    // Restrict to safe image formats
    formats: ['image/webp', 'image/avif'],
    // Set reasonable size limits
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },
  // Note: Avoid standalone output on Vercel to prevent traced file copy issues
  async redirects() {
    return [
      {
        source: '/properties/:id',
        destination: '/sales/:id',
        permanent: true,
      },
      {
        source: '/properties',
        destination: '/sales',
        permanent: true,
      },
      {
        source: '/login',
        destination: '/auth/signin',
        permanent: true,
      },
    ]
  },
  // Compress responses
  compress: true,
  // Enable SWC minification
  swcMinify: true,
  // Security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'Referrer-Policy',
            value: 'no-referrer',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(self)',
          },
          {
            key: 'Content-Security-Policy',
        value: "default-src 'self'; " +
                   // Allow runtime scripts from self; keep eval for Next dev/runtime; allow Vercel Live script in previews; allow Microsoft Clarity; allow Google AdSense; allow Stripe Elements; allow Sentry
                   "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://widget.cloudinary.com https://upload-widget.cloudinary.com https://vercel.live https://www.clarity.ms https://scripts.clarity.ms https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep2.adtrafficquality.google https://js.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; " +
                   // Allow Mapbox CSS
                   "style-src 'self' 'unsafe-inline' https://api.mapbox.com; " +
                   // Some browsers use script-src-elem separately; must include all script-src domains plus Stripe and Sentry
                   "script-src-elem 'self' 'unsafe-inline' https://widget.cloudinary.com https://upload-widget.cloudinary.com https://vercel.live https://www.clarity.ms https://scripts.clarity.ms https://pagead2.googlesyndication.com https://googleads.g.doubleclick.net https://ep2.adtrafficquality.google https://js.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; " +
                   // Some browsers use style-src-elem separately
                   "style-src-elem 'self' 'unsafe-inline' https://api.mapbox.com; " +
                   // Permit WebWorkers (Mapbox GL uses blob workers)
                   "worker-src 'self' blob:; child-src blob:; " +
                   // Images and fonts (allow blob: for temporary image previews before upload)
                   "img-src 'self' data: blob: https: https://res.cloudinary.com; font-src 'self' data:; " +
                   // Network connections - allow Clarity API calls, AdSense, Stripe API, and Sentry
                   "connect-src 'self' https: https://api.cloudinary.com https://vercel.live https://www.clarity.ms https://googleads.g.doubleclick.net https://pagead2.googlesyndication.com https://tpc.googlesyndication.com https://api.stripe.com https://m.stripe.network https://q.stripe.com https://*.ingest.sentry.io https://*.ingest.us.sentry.io; " +
                   // Misc - allow AdSense frames (including safeframes, quality monitoring, and Google domains), Vercel Live, and Stripe Elements
                   "frame-src https://widget.cloudinary.com https://upload-widget.cloudinary.com https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://*.googlesyndication.com https://ep2.adtrafficquality.google https://www.google.com https://vercel.live https://js.stripe.com; object-src 'none'; base-uri 'self'; form-action 'self';",
          },
        ],
      },
      // Cache control for authenticated routes
      {
        source: '/api/auth/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
      {
        source: '/api/sales/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-store, no-cache, must-revalidate',
          },
        ],
      },
    ]
  },
  // Transpile Supabase packages to fix ESM/CJS interop issues
  transpilePackages: ['@supabase/supabase-js', '@supabase/ssr'],
  // Server Actions configuration
  experimental: {
    optimizePackageImports: ['react-virtuoso'],
    serverActions: {
      bodySizeLimit: '1mb', // Limit Server Actions body size
    },
  },
  // Disable Vercel Live Feedback in development
  ...(process.env.NODE_ENV === 'development' && {
    devIndicators: {
      buildActivity: false,
      buildActivityPosition: 'bottom-right',
    },
  }),
  webpack: (config, { isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    // Fix Supabase module resolution issue
    // Handle ESM modules from @supabase packages
    // Ensure .mjs files are handled correctly (add to beginning to prioritize)
    if (!config.resolve.extensions.includes('.mjs')) {
      config.resolve.extensions.unshift('.mjs')
    }
    // Configure module rules to handle .mjs files as ESM
    config.module.rules.push({
      test: /\.mjs$/,
      include: /node_modules\/@supabase/,
      type: 'javascript/auto',
      resolve: {
        fullySpecified: false,
      },
    })
    // Reduce noisy webpack infra warnings about cache string serialization
    config.infrastructureLogging = {
      level: 'error',
    }
    return config
  },
  // Environment variables for console cleanup
  env: {
    // Disable Mapbox telemetry in development and test
    MAPBOX_ACCESS_TOKEN: process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN,
    // Disable Vercel Live Feedback
    NEXT_PUBLIC_VERCEL_LIVE_FEEDBACK: 'false',
  },
}

// Wrap with Sentry configuration
module.exports = withSentryConfig(
  nextConfig,
  {
    // Sentry webpack plugin options
    silent: true, // Suppress source map uploading logs
    org: process.env.SENTRY_ORG,
    project: process.env.SENTRY_PROJECT,
    // Hide source maps from public access
    hideSourceMaps: true,
    // Disable Sentry logger
    disableLogger: true,
    // Do not widen client/server bundle
    widenClientFileUpload: false,
    // Transpile client SDK
    transpileClientSDK: true,
    // Tunnel requests to Sentry (optional, for ad blockers)
    tunnelRoute: '/monitoring',
    // Automatically tree-shake Sentry logger statements
    automaticVercelMonitors: true,
  },
  {
    // Sentry build-time options
    // Disable source map upload in non-production
    dryRun: process.env.NODE_ENV !== 'production',
  }
)
