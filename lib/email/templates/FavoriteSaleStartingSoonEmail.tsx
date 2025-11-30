/**
 * Favorite Sale Starting Soon Email Template
 * Sent when a user has favorited a sale and it's starting within 24 hours
 */

import {
  Section,
  Text,
  Heading,
  Button,
  Link,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface FavoriteSaleStartingSoonEmailProps {
  recipientName?: string | null
  saleTitle: string
  saleAddress: string
  dateRange: string
  timeWindow?: string
  saleUrl: string
}

export function FavoriteSaleStartingSoonEmail({
  recipientName,
  saleTitle,
  saleAddress,
  dateRange,
  timeWindow,
  saleUrl,
}: FavoriteSaleStartingSoonEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'

  return (
    <BaseLayout
      previewText={`A sale you saved is starting soon: ${saleTitle} on ${dateRange}`}
    >
      <Heading style={headingStyle}>
        A sale you saved is starting soon ⏰
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        One of your favorite yard sales is about to start. Don't miss out!
      </Text>

      <Section style={detailsSectionStyle}>
        <Text style={detailLabelStyle}>Sale Details:</Text>
        <Text style={detailTextStyle}>
          <strong>{saleTitle}</strong>
        </Text>
        <Text style={detailTextStyle}>
          📍 {saleAddress}
        </Text>
        <Text style={detailTextStyle}>
          📅 {dateRange}
        </Text>
        {timeWindow && (
          <Text style={detailTextStyle}>
            🕐 {timeWindow}
          </Text>
        )}
      </Section>

      <Section style={buttonSectionStyle}>
        <Button href={saleUrl} style={buttonStyle}>
          View Sale
        </Button>
      </Section>

      <Text style={textStyle}>
        You're receiving this because you favorited this sale on LootAura. 
        Visit your favorites to manage your saved sales.
      </Text>
    </BaseLayout>
  )
}

/**
 * Generate subject line for favorite sale starting soon email
 */
export function buildFavoriteSaleStartingSoonSubject(saleTitle: string): string {
  return `A sale you saved is starting soon: ${saleTitle}`
}

// Email-safe inline styles (reused from SaleCreatedConfirmationEmail)
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

const detailsSectionStyle = {
  backgroundColor: '#f9f9f9',
  border: '1px solid #e5e5e5',
  borderRadius: '4px',
  padding: '20px',
  margin: '24px 0',
}

const detailLabelStyle = {
  color: '#666666',
  fontSize: '14px',
  fontWeight: 'bold',
  margin: '0 0 12px 0',
  textTransform: 'uppercase' as const,
}

const detailTextStyle = {
  color: '#333333',
  fontSize: '16px',
  lineHeight: '24px',
  margin: '0 0 8px 0',
}

const buttonSectionStyle = {
  margin: '32px 0',
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

