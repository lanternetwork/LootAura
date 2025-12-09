'use client'

interface AccountLockedBannerProps {
  lockReason?: string | null
}

export default function AccountLockedBanner({ lockReason }: AccountLockedBannerProps) {
  return (
    <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
      <div className="flex">
        <div className="flex-shrink-0">
          <svg
            className="h-5 w-5 text-red-400"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
              clipRule="evenodd"
            />
          </svg>
        </div>
        <div className="ml-3">
          <p className="text-sm text-red-700">
            <strong>Your account has been locked</strong> due to a violation of our terms. You can browse existing sales but cannot create or edit content.
            {lockReason && (
              <span className="block mt-1 text-xs text-red-600">
                Reason: {lockReason}
              </span>
            )}
          </p>
        </div>
      </div>
    </div>
  )
}

