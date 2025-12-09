import { notFound } from 'next/navigation'
import { getSaleById } from '@/lib/data'
import SellWizardClient from '../../new/SellWizardClient'
import { getAdminDb, fromBase } from '@/lib/supabase/clients'

interface SellEditPageProps {
  params: {
    id: string
  }
}

export default async function SellEditPage({ params }: SellEditPageProps) {
  const sale = await getSaleById(params.id)

  if (!sale) {
    notFound()
  }

  // Fetch tags directly from base table if not in view
  // The view might not include tags or they might be null
  let tags: string[] = []
  if (sale.tags && Array.isArray(sale.tags) && sale.tags.length > 0) {
    tags = sale.tags.filter(Boolean)
    if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
      console.log('[EDIT_PAGE] Tags from sale.tags:', tags)
    }
  } else {
    // Try to fetch from base table as fallback
    try {
      const admin = getAdminDb()
      const { data: saleData } = await fromBase(admin, 'sales')
        .select('tags')
        .eq('id', params.id)
        .maybeSingle()
      
      if (saleData && saleData.tags) {
        if (Array.isArray(saleData.tags)) {
          tags = saleData.tags.filter(Boolean)
        } else if (typeof saleData.tags === 'string') {
          tags = [saleData.tags]
        }
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[EDIT_PAGE] Tags from base table:', tags)
        }
      } else {
        if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
          console.log('[EDIT_PAGE] No tags found in base table for sale:', params.id)
        }
      }
    } catch (error) {
      // If fetching fails, continue with empty array
      console.error('[EDIT_PAGE] Error fetching tags:', error)
    }
  }
  
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[EDIT_PAGE] Final tags to pass to SellWizardClient:', tags)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <SellWizardClient 
        initialData={{
          title: sale.title,
          description: sale.description,
          address: sale.address,
          city: sale.city,
          state: sale.state,
          zip_code: sale.zip_code,
          date_start: sale.date_start,
          time_start: sale.time_start,
          date_end: sale.date_end,
          time_end: sale.time_end,
          price: sale.price,
          tags: tags,
          status: sale.status
        }}
        isEdit={true}
        saleId={sale.id}
      />
    </div>
  )
}
