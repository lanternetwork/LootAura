/**
 * Sale Created Confirmation Email Template
 * Sent when a user successfully publishes a sale
 */

import {
  Section,
  Text,
  Heading,
  Button,
  Link,
} from '@react-email/components'
import { BaseLayout } from './BaseLayout'

export interface SaleCreatedConfirmationEmailProps {
  recipientName?: string
  saleTitle: string
  saleAddress: string
  dateRange: string
  timeWindow?: string
  saleUrl: string
  manageUrl: string
  isFeatured?: boolean
}

export function SaleCreatedConfirmationEmail({
  recipientName,
  saleTitle,
  saleAddress,
  dateRange,
  timeWindow,
  saleUrl,
  manageUrl,
  isFeatured = false,
}: SaleCreatedConfirmationEmailProps) {
  const greeting = recipientName ? `Hi ${recipientName},` : 'Hi there,'

  return (
    <BaseLayout
      previewText={buildSaleCreatedPreview({
        saleTitle,
        dateRange,
        addressLine: saleAddress,
      })}
    >
      <Heading style={headingStyle}>
        Your yard sale is live on LootAura 🚀
      </Heading>

      <Text style={textStyle}>
        {greeting}
      </Text>

      <Text style={textStyle}>
        Great news! Your yard sale has been successfully published and is now live on LootAura. 
        {isFeatured && (
          <>
            {' '}Your sale is <strong>featured</strong>, which means it will be highlighted to shoppers and appear in our weekly featured sales email.
          </>
        )}
        {' '}Shoppers can now find and view your sale on the map.
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
          View Your Sale on LootAura
        </Button>
      </Section>

      <Section style={linksSectionStyle}>
        <Text style={linkTextStyle}>
          <Link href={manageUrl} style={linkStyle}>
            Edit your sale
          </Link>
          {' · '}
          <Link href={manageUrl} style={linkStyle}>
            View seller dashboard
          </Link>
        </Text>
      </Section>

      <Text style={textStyle}>
        You can manage your sale, view analytics, and make updates from your dashboard at any time.
      </Text>
    </BaseLayout>
  )
}

/**
 * Generate subject line for sale created confirmation email
 */
export function buildSaleCreatedSubject(_saleTitle: string): string {
  return `Your yard sale is live on LootAura 🚀`
}

/**
 * @deprecated Use buildSaleCreatedSubject instead. This function is kept for backward compatibility.
 */
export function getSaleCreatedSubject(saleTitle: string): string {
  return buildSaleCreatedSubject(saleTitle)
}

/**
 * Build preview text for email clients
 */
export function buildSaleCreatedPreview(params: {
  saleTitle: string
  dateRange: string
  addressLine: string
}): string {
  const { saleTitle, dateRange, addressLine } = params
  return `Your sale "${saleTitle}" has been created and is ready for shoppers. ${dateRange} at ${addressLine}`
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

const linksSectionStyle = {
  margin: '24px 0',
  textAlign: 'center' as const,
}

const linkTextStyle = {
  color: '#666666',
  fontSize: '14px',
  lineHeight: '20px',
  margin: '0',
}

const linkStyle = {
  color: '#3A2268',
  textDecoration: 'underline',
}

