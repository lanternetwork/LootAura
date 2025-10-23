import AdminTools from '@/components/AdminTools'

export default function AdminPage() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Admin Tools</h1>
          <p className="mt-2 text-gray-600">
            Development and debugging tools for LootAura
          </p>
        </div>
        
        <div className="space-y-8">
          <AdminTools />
        </div>
      </div>
    </div>
  )
}
