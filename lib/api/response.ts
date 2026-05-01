type ErrorResponseOptions = {
  status?: number
  code?: string
  details?: unknown
  extra?: Record<string, unknown>
}

export function errorResponse(message: string, options?: ErrorResponseOptions) {
  return Response.json(
    {
      ok: false,
      ...(options?.code ? { code: options.code } : {}),
      error: { message },
      ...(options?.details ? { details: options.details } : {}),
      ...(options?.extra ?? {}),
    },
    { status: options?.status ?? 400 }
  )
}

type OkResponseOptions = {
  status?: number
}

export function okResponse<T extends Record<string, unknown>>(data: T, options?: OkResponseOptions) {
  return Response.json(
    {
      ok: true,
      ...data,
    },
    { status: options?.status ?? 200 }
  )
}
