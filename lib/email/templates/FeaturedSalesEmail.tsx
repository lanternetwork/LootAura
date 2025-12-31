/**
 * Featured Sales Email Template
 * Sent weekly to users showing 12 featured sales for the next 7 days
 */

import {
  Section,
  Text,
  Heading,
  Button,
  Img,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface FeaturedSaleItem {
  saleId: string
  saleTitle: string
  saleAddress?: string
  dateRange?: string
  saleUrl: string
  coverImageUrl?: string
}

export interface FeaturedSalesEmailProps {
  recipientName?: string | null
  sales: FeaturedSaleItem[]
  baseUrl?: string
  unsubscribeUrl?: string
}

export function FeaturedSalesEmail({
  recipientName,
  sales,
  baseUrl = 'https://lootaura.com',
  unsubscribeUrl,
}: FeaturedSalesEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'

  // Build preview text
  const previewText = `Check out ${sales.length} featured yard sales near you this week`

  return (
    <BaseLayout previewText={previewText} unsubscribeUrl={unsubscribeUrl} baseUrl={baseUrl}>
      <Heading style={headingStyle}>
        Featured Sales
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        Here are {sales.length} featured yard sales happening near you in the next 7 days:
      </Text>

      {/* List of sales */}
      {sales.map((sale, index) => (
        <Section key={sale.saleId} style={saleCardStyle}>
          {sale.coverImageUrl && (
            <Img
              src={sale.coverImageUrl}
              alt={sale.saleTitle}
              width="100%"
              style={saleImageStyle}
            />
          )}
          <Text style={saleTitleStyle}>
            {sale.saleTitle}
          </Text>
          {sale.dateRange && (
            <Text style={saleDetailStyle}>
              📅 {sale.dateRange}
            </Text>
          )}
          {sale.saleAddress && (
            <Text style={saleDetailStyle}>
              📍 {sale.saleAddress}
            </Text>
          )}
          <Section style={buttonSectionStyle}>
            <Button href={sale.saleUrl} style={buttonStyle}>
              View Sale
            </Button>
          </Section>
          {index < sales.length - 1 && (
            <Section style={dividerStyle}>
              <Text style={dividerTextStyle}>—</Text>
            </Section>
          )}
        </Section>
      ))}
    </BaseLayout>
  )
}

/**
 * Generate subject line for featured sales email
 * @param salesCount - Number of sales in the email
 * @returns Subject line string
 */
export function buildFeaturedSalesSubject(salesCount: number): string {
  if (salesCount === 0) {
    return 'Featured Sales'
  }
  
  if (salesCount === 1) {
    return 'Featured Sale Near You'
  }
  
  return `${salesCount} Featured Sales Near You`
}

// Email-safe inline styles
const headingStyle = {
  color: '#1a1a1a',
  fontSize: '24px',
  fontWeight: 'bold',
  lineHeight: '32px',
  margin: '0 0 24px 0',
}

const textStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 16px 0',
}

const saleCardStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  padding: '20px',
  margin: '0 0 20px 0',
}

const saleImageStyle = {
  width: '100%',
  maxWidth: '100%',
  height: 'auto',
  borderRadius: '4px',
  marginBottom: '12px',
  objectFit: 'cover' as const,
}

const saleTitleStyle = {
  color: '#1a1a1a',
  fontSize: '18px',
  fontWeight: 'bold',
  lineHeight: '24px',
  margin: '0 0 12px 0',
}

const saleDetailStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 8px 0',
}

const buttonSectionStyle = {
  marginTop: '16px',
}

const buttonStyle = {
  backgroundColor: '#3A2268',
  color: '#ffffff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  padding: '12px 24px',
  borderRadius: '4px',
  display: 'inline-block',
}

const dividerStyle = {
  margin: '20px 0',
  textAlign: 'center' as const,
}

const dividerTextStyle = {
  color: '#cccccc',
  fontSize: '16px',
  margin: '0',
}

