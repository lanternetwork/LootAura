import { NextResponse } from 'next/server'
import { assertAdminOrThrow } from '@/lib/auth/adminGate'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

export async function GET(request: Request) {
  try {
    await assertAdminOrThrow(request)

    const db = getAdminDb()

    // Fetch all items with their image data
    const { data: items, error } = await fromBase(db, 'items')
      .select('id, sale_id, name, image_url, images')
      .limit(100) // Limit to first 100 items for diagnostics

    if (error) {
      console.error('[ItemDiagnostics] Error fetching items:', error)
      return NextResponse.json(
        { error: 'Failed to fetch items', details: error.message },
        { status: 500 }
      )
    }

    const diagnostics: Array<{
      id: string
      sale_id: string
      name: string
      image_url?: string | null
      images?: string[] | null
      images_type: string
      images_length: number
      first_image_url?: string | null
      has_image_url: boolean
      has_images_array: boolean
      raw_data: any
    }> = []

    const errors: string[] = []

    items?.forEach((item: any) => {
      try {
        const has_image_url = !!item.image_url
        const images_array = item.images
        const has_images_array = Array.isArray(images_array) && images_array.length > 0
        const images_length = Array.isArray(images_array) ? images_array.length : 0
        const first_image_url = has_images_array
          ? images_array[0]
          : (has_image_url ? item.image_url : null)

        diagnostics.push({
          id: item.id,
          sale_id: item.sale_id,
          name: item.name,
          image_url: item.image_url,
          images: images_array,
          images_type: Array.isArray(images_array) ? 'array' : typeof images_array,
          images_length,
          first_image_url,
          has_image_url,
          has_images_array,
          raw_data: item,
        })
      } catch (err: any) {
        errors.push(`Error processing item ${item.id}: ${err.message}`)
      }
    })

    // Calculate statistics
    const total_items = diagnostics.length
    const items_with_images_array = diagnostics.filter((d) => d.has_images_array).length
    const items_with_image_url = diagnostics.filter((d) => d.has_image_url).length
    const items_with_both = diagnostics.filter((d) => d.has_images_array && d.has_image_url).length
    const items_with_neither = diagnostics.filter(
      (d) => !d.has_images_array && !d.has_image_url
    ).length
    const items_with_images = diagnostics.filter(
      (d) => d.has_images_array || d.has_image_url
    ).length

    // Get sample items (up to 10)
    const sample_items = diagnostics.slice(0, 10)

    return NextResponse.json({
      total_items,
      items_with_images,
      items_with_image_url,
      items_with_images_array,
      items_with_both,
      items_with_neither,
      sample_items,
      errors,
    })
  } catch (error: any) {
    console.error('[ItemDiagnostics] Unexpected error:', error)
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: error.status || 500 }
    )
  }
}

