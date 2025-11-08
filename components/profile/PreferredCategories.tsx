'use client'

type PreferredCategoriesProps = {
  categories: string[]
}

export function PreferredCategories({ categories }: PreferredCategoriesProps) {
  if (!categories || categories.length === 0) return null

  return (
    <div className="card">
      <div className="card-body">
        <div className="text-sm text-neutral-600 mb-2">Preferred categories (auto‑derived from your listings)</div>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <span key={c} className="badge-accent">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

