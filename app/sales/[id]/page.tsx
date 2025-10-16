import { notFound } from 'next/navigation'
import { getSaleById } from '@/lib/data'
import SaleDetailClient from './SaleDetailClient'
import { createSaleMetadata } from '@/lib/metadata'

interface SaleDetailPageProps {
  params: {
    id: string
  }
}

export default async function SaleDetailPage({ params }: SaleDetailPageProps) {
  const sale = await getSaleById(params.id)

  if (!sale) {
    notFound()
  }

  const _metadata = createSaleMetadata(sale)

  return (
    <div className="min-h-screen bg-gray-50">
      <SaleDetailClient sale={sale} />
    </div>
  )
}

export async function generateMetadata({ params }: SaleDetailPageProps) {
  const sale = await getSaleById(params.id)
  
  if (!sale) {
    return {
      title: 'Sale Not Found',
      description: 'The requested sale could not be found.'
    }
  }

  return createSaleMetadata(sale)
}
