export default function SaleDetailLoading() {
  return (
    <div className="min-h-screen bg-gray-50" aria-busy="true" aria-label="Loading sale details">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 animate-pulse">
        <div className="mb-4 h-4 w-24 rounded bg-gray-200" />
        <div className="mb-6 aspect-[16/9] rounded-lg bg-gray-200 md:aspect-[4/3]" />
        <div className="space-y-3 md:hidden">
          <div className="h-7 w-3/4 rounded bg-gray-200" />
          <div className="h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-5/6 rounded bg-gray-200" />
          <div className="mt-6 h-40 rounded-lg bg-gray-200" />
        </div>
        <div className="hidden gap-8 md:grid md:grid-cols-1 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="h-7 w-2/3 rounded bg-gray-200" />
            <div className="h-4 w-full rounded bg-gray-200" />
            <div className="h-4 w-4/5 rounded bg-gray-200" />
            <div className="h-56 rounded-lg bg-gray-200" />
          </div>
          <div className="space-y-4">
            <div className="h-48 rounded-2xl bg-gray-200" />
            <div className="h-32 rounded-2xl bg-gray-200" />
          </div>
        </div>
      </div>
    </div>
  )
}
