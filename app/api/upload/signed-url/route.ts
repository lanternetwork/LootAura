import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createRateLimitMiddleware, RATE_LIMITS } from '@/lib/rateLimiter'

// Validation schema
const uploadRequestSchema = z.object({
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp'], {
    errorMap: () => ({ message: 'Only JPEG, PNG, and WebP images are allowed' })
  }),
  sizeBytes: z.number().int().positive().max(
    parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || '5242880'), // 5MB default
    { message: 'File size exceeds maximum allowed' }
  ),
  ext: z.string().optional(),
  entity: z.enum(['sale', 'profile']),
  entityId: z.string().uuid().optional()
})

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitMiddleware = createRateLimitMiddleware(RATE_LIMITS.UPLOAD_SIGNER)
    const { allowed, error: rateLimitError } = rateLimitMiddleware(request)
    
    if (!allowed) {
      return NextResponse.json(
        { error: rateLimitError },
        { status: 429 }
      )
    }

    // Validate input
    const body = await request.json()
    const { mimeType, sizeBytes, ext, entity, entityId: _entityId } = uploadRequestSchema.parse(body)

    // Check authentication
    const supabase = createSupabaseServerClient()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[UPLOAD] Auth failed', { event: 'upload-signer', status: 'fail', code: authError?.message })
      }
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[UPLOAD] Signed URL creation failed', { event: 'upload-signer', status: 'fail', code: signedUrlError.message })
      }
      return NextResponse.json(
        { error: 'Failed to create upload URL' },
        { status: 500 }
      )
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

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
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
      if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
        console.log('[UPLOAD] Validation failed', { event: 'upload-signer', status: 'fail', errors: error.errors.length })
      }
      return NextResponse.json(
        { error: 'Invalid upload request', details: error.errors },
        { status: 400 }
      )
    }

    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[UPLOAD] Unexpected error', { event: 'upload-signer', status: 'fail' })
    }
    console.error('[UPLOAD] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
