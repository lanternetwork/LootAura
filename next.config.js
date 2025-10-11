const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
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
  },
  experimental: {
    optimizePackageImports: ['react-virtuoso'],
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
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': path.resolve(__dirname),
    }
    // Reduce noisy webpack infra warnings about cache string serialization
    config.infrastructureLogging = {
      level: 'error',
    }
    return config
  },
}

module.exports = nextConfig
