interface EmptyStateProps {
  title?: string
  cta?: React.ReactNode
  /** Contextual suggestions based on current state */
  suggestions?: string[]
}

export default function EmptyState({ 
  title = "No Sales Found", 
  cta,
  suggestions = []
}: EmptyStateProps) {
  return (
    <div className="text-center py-16 text-neutral-500">
      <div className="text-6xl mb-4">🔎</div>
      <div className="text-lg font-medium">{title}</div>
      {suggestions.length > 0 && (
        <div className="mt-4 space-y-1">
          {suggestions.map((suggestion, index) => (
            <div key={index} className="text-sm text-neutral-400">
              {suggestion}
            </div>
          ))}
        </div>
      )}
      {cta ? <div className="mt-4">{cta}</div> : null}
    </div>
  )
}
