import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Maintenance | LootAura',
  description: 'LootAura is temporarily unavailable while we perform maintenance.',
  robots: {
    index: false,
    follow: false,
  },
}

export default function MaintenancePage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="mb-6">
            <svg
              className="mx-auto h-16 w-16 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Temporarily Unavailable
          </h1>
          <p className="text-gray-600 mb-6">
            LootAura is currently undergoing maintenance. We&apos;ll be back online shortly.
          </p>
          <p className="text-sm text-gray-500">
            Administrators can still access{' '}
            <a
              href="/admin/tools"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              /admin/tools
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  )
}

