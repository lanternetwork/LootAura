import React, { PropsWithChildren } from 'react'
import { render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

type Options = RenderOptions & {
  queryClient?: QueryClient
}

export function renderWithProviders(ui: React.ReactElement, options?: Options) {
  const client = options?.queryClient || new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const wrapper = ({ children }: PropsWithChildren<{}>) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )

  return render(ui, { wrapper, ...options })
}


