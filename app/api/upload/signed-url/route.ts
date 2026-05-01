import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'

// Validation schema (size validation happens at runtime)
const uploadRequestSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({ message: 'Only JPEG, PNG, and WebP images are allowed' })
  }),
  sizeBytes: z.number().int().positive(),
  ext: z.string().optional(),
  entity: z.enum(['sale', 'profile']),
  entityId: z.string().uuid().optional()
})

export async function POST(request: NextRequest) {
  const errorResponse = (status: number, code: string, message: string, details?: unknown) =>
    NextResponse.json(
      {
        ok: false,
        error: {
          code,
          message,
        },
        ...(details !== undefined ? { details } : {}),
      },
      { status }
    )

  try {
    // Rate limiting
    const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMITS.UPLOAD_SIGNER)
    const { allowed, error: rateLimitError } = rateLimitMiddleware(request)
    
    if (!allowed) {
      return errorResponse(429, 'RATE_LIMIT_EXCEEDED', rateLimitError || 'Too many requests. Please try again later.')
    }

    // Validate input
    const body = await request.json()
    const { mimeType, sizeBytes, ext, entity, entityId: _entityId } = uploadRequestSchema.parse(body)
    
    // Validate file size against configured limit
    const { ENV_SERVER } = await import('@/lib/env')
    const maxSizeBytes = ENV_SERVER.MAX_UPLOAD_SIZE_BYTES || 5242880 // 5MB default
    if (sizeBytes > maxSizeBytes) {
      return errorResponse(400, 'INVALID_REQUEST', `File size exceeds maximum allowed (${Math.round(maxSizeBytes / 1024 / 1024)}MB)`)
    }

    // Check authentication
    const supabase = await createSupabaseServerClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      const { isDebugMode } = await import('@/lib/env')
      if (isDebugMode()) {
        console.log('[UPLOAD] Auth failed', { event: 'upload-signer', status: 'fail', code: authError?.message })
      }
      return errorResponse(401, 'UNAUTHORIZED', 'Authentication required')
    }

    // Generate unique object key (no user ID exposure)
    const timestamp = Date.now()
    const randomSuffix = Math.random().toString(36).substring(2, 15)
    const fileExtension = ext || mimeType.split('/')[1]
    const objectKey = `${entity}/${timestamp}-${randomSuffix}.${fileExtension}`

    // Create signed URL for upload
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('images')
      .createSignedUploadUrl(objectKey, {
        upsert: false // Don't allow overwriting existing files
      })

    if (signedUrlError) {
      const { isDebugMode } = await import('@/lib/env')
      if (isDebugMode()) {
        console.log('[UPLOAD] Signed URL creation failed', { event: 'upload-signer', status: 'fail', code: signedUrlError.message })
      }
      return errorResponse(500, 'INTERNAL_ERROR', 'Failed to create upload URL')
    }

    // Generate public URL for the uploaded file
    const { data: publicUrlData } = supabase.storage
      .from('images')
      .getPublicUrl(objectKey)

    const response = {
      uploadUrl: signedUrlData.signedUrl,
      publicUrl: publicUrlData.publicUrl,
      expiresIn: 3600, // 1 hour
      objectKey // Include for potential cleanup
    }

    const { isDebugMode } = await import('@/lib/env')
    if (isDebugMode()) {
      console.log('[UPLOAD] Signed URL created', { 
        event: 'upload-signer', 
        status: 'ok',
        entity,
        sizeBytes,
        mimeType: mimeType.split('/')[1] // Log only file type, not full MIME
      })
    }

    return NextResponse.json(response)

  } catch (error) {
    if (error instanceof z.ZodError) {
      const { isDebugMode } = await import('@/lib/env')
      if (isDebugMode()) {
        console.log('[UPLOAD] Validation failed', { event: 'upload-signer', status: 'fail', errors: error.errors.length })
      }
      return errorResponse(400, 'INVALID_REQUEST', 'Invalid upload request', error.errors)
    }

    const { isDebugMode } = await import('@/lib/env')
    if (isDebugMode()) {
      console.log('[UPLOAD] Unexpected error', { event: 'upload-signer', status: 'fail' })
    }
    console.error('[UPLOAD] Unexpected error:', error)
    return errorResponse(500, 'INTERNAL_ERROR', 'Internal server error')
  }
}
