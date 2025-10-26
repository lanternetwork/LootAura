export default function SaleCardSkeleton() {
  return (
    <div className="animate-pulse bg-white rounded-lg border p-3 shadow-sm" style={{ minHeight: '160px' }}>
      <div className="flex justify-between items-start mb-3">
        <div className="h-6 bg-gray-200 rounded w-3/4"></div>
        <div className="h-6 w-6 bg-gray-200 rounded"></div>
      </div>
      
      <div className="space-y-2 mb-3">
        <div className="h-4 bg-gray-200 rounded w-full"></div>
        <div className="h-4 bg-gray-200 rounded w-2/3"></div>
      </div>
      
      <div className="space-y-2 mb-3">
        <div className="h-3 bg-gray-200 rounded w-1/2"></div>
        <div className="h-3 bg-gray-200 rounded w-1/3"></div>
      </div>
      
      <div className="h-4 bg-gray-200 rounded w-1/4"></div>
    </div>
  )
}
