'use client'

export default function AnalyticsPanel() {
  return (
    <div className="card">
      <div className="card-body-lg">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="card-title">Analytics</h2>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {['Views', 'Saves', 'CTR'].map((label) => (
            <div key={label} className="card">
              <div className="card-body">
                <div className="card-subtitle">{label}</div>
                <div className="text-2xl font-semibold mt-2">—</div>
                <div className="text-xs text-gray-500 mt-1">Coming soon</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

