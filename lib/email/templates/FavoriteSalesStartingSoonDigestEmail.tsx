/**
 * Favorite Sales Starting Soon Digest Email Template
 * Sent when a user has multiple favorited sales starting soon
 * Consolidates all upcoming favorited sales into a single digest email
 */

import {
  Section,
  Text,
  Heading,
  Button,
  Link,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface SaleDigestItem {
  saleId: string
  saleTitle: string
  saleAddress: string
  dateRange: string
  timeWindow?: string
  saleUrl: string
}

export interface FavoriteSalesStartingSoonDigestEmailProps {
  recipientName?: string | null
  sales: SaleDigestItem[]
  hoursBeforeStart: number
  baseUrl?: string
  unsubscribeUrl?: string
}

export function FavoriteSalesStartingSoonDigestEmail({
  recipientName,
  sales,
  hoursBeforeStart,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  baseUrl: _baseUrl = 'https://lootaura.com',
  unsubscribeUrl,
}: FavoriteSalesStartingSoonDigestEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'
  const isMultiple = sales.length > 1

  // Build preview text
  const previewText = isMultiple
    ? `You have ${sales.length} saved sales starting soon`
    : `A sale you saved is starting soon: ${sales[0]?.saleTitle}`

  return (
    <BaseLayout previewText={previewText}>
      <Heading style={headingStyle}>
        {isMultiple
          ? `You have ${sales.length} saved sales starting soon ⏰`
          : 'A sale you saved is starting soon ⏰'}
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        {isMultiple
          ? `You have ${sales.length} favorite yard sales starting within the next ${hoursBeforeStart} hours. Don't miss out!`
          : `One of your favorite yard sales is about to start within the next ${hoursBeforeStart} hours. Don't miss out!`}
      </Text>

      {/* List of sales */}
      {sales.map((sale, index) => (
        <Section key={sale.saleId} style={saleCardStyle}>
          <Text style={saleTitleStyle}>
            {sale.saleTitle}
          </Text>
          <Text style={saleDetailStyle}>
            📍 {sale.saleAddress}
          </Text>
          <Text style={saleDetailStyle}>
            📅 {sale.dateRange}
          </Text>
          {sale.timeWindow && (
            <Text style={saleDetailStyle}>
              🕐 {sale.timeWindow}
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

      {/* Canonical footer with unsubscribe link */}
      <Text style={footerNoteStyle}>
        You're receiving this email because you're subscribed to LootAura notifications.{' '}
        {unsubscribeUrl && (
          <>
            To unsubscribe from all non-administrative emails,{' '}
            <Link href={unsubscribeUrl} style={linkStyle}>
              click here
            </Link>.
          </>
        )}
      </Text>
    </BaseLayout>
  )
}

/**
 * Generate subject line for favorite sales starting soon digest email
 * @param sales - Array of sales in the digest
 * @returns Subject line string
 */
export function buildFavoriteSalesStartingSoonDigestSubject(sales: SaleDigestItem[]): string {
  if (sales.length === 0) {
    return 'Saved sales starting soon'
  }
  
  if (sales.length === 1) {
    return `A sale you saved is starting soon: ${sales[0].saleTitle}`
  }
  
  return `Several saved sales are starting soon near you`
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
  margin: '16px 0 0 0',
  textAlign: 'center' as const,
}

const buttonStyle = {
  backgroundColor: '#3A2268',
  borderRadius: '4px',
  color: '#ffffff',
  display: 'inline-block',
  fontSize: '16px',
  fontWeight: 'bold',
  lineHeight: '44px',
  padding: '0 32px',
  textDecoration: 'none',
}

const dividerStyle = {
  margin: '20px 0 0 0',
  textAlign: 'center' as const,
}

const dividerTextStyle = {
  color: '#cccccc',
  fontSize: '16px',
  margin: '0',
}

const footerNoteStyle = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '24px 0 0 0',
}

const linkStyle = {
  color: '#3A2268',
  textDecoration: 'underline',
}

